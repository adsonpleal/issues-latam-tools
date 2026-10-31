#!/usr/bin/env node
// A fila da triagem automática: o quadro é a própria fila.
//
//   node tools/triagem.mjs bootstrap            # marca d'água = agora, não pega nada do passado
//   node tools/triagem.mjs fila                 # o que está maduro para pegar, em JSON
//   node tools/triagem.mjs pegar <id>           # reportado -> em_progresso, trava o card
//   node tools/triagem.mjs pr <id> <dono/repo#N>
//   node tools/triagem.mjs parar <id> --motivo "..."   # não procede: -> backlog, com comentário
//   node tools/triagem.mjs reconciliar          # PR mesclado -> resolvido
//   node tools/triagem.mjs estado               # o que a automação enxerga agora
//
// Não há fila em arquivo à parte, e isso é a decisão central: `status` no
// Firestore É a fila. Pegar um card é movê-lo para `em_progresso`, e o
// Firestore recusa a segunda escrita (precondição de updateTime), então dois
// despachantes simultâneos não podem pegar o mesmo card. De quebra, você vê a
// fila no quadro e tira um card dela arrastando — sem mexer em nada aqui.
//
// A marca d'água existe pelo mesmo motivo do anunciador: ligar isto com 16
// cards parados em `reportado` despejaria 16 sessões de uma vez. `bootstrap`
// grava "a partir de agora" e o passado fica onde está.
//
// Escreve AUTENTICADO (tools/credencial.mjs), ao contrário do anunciador, que
// consulta anônimo de propósito. Aqui não tem escolha: mover card e comentar
// são escritas que as regras só liberam para o admin. Em compensação, este
// script nunca lê `privado/contato` — não há caminho de código para isso.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { accessToken } from "./credencial.mjs";

const PROJETO_FIREBASE = process.env["FIREBASE_PROJECT_ID"] || "issues-latam-tools";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJETO_FIREBASE}/databases/(default)/documents`;

/** Fora do repositório: o estado não pode ir junto num commit nem sumir num clone novo. */
const ESTADO =
  process.env["TRIAGEM_ESTADO"] || join(homedir(), ".claude", "triagem-automatica", "estado.json");

/**
 * Quantos cards a automação pode ter em voo ao mesmo tempo. O limite não é do
 * Firestore nem do GitHub: é desta máquina, que roda os testes, sobe instância
 * e tira captura de cada sessão. Dois já deixam o ventilador ligado.
 */
const EM_VOO_MAX = Number(process.env["TRIAGEM_EM_VOO_MAX"] || 2);

/** Espelho de src/lib/projetos.ts — e o repositório de cada um. */
export const REPOS = {
  mercado: "adsonpleal/latam-market",
  simulador: "adsonpleal/latam-ro-calc",
  recap: "adsonpleal/ragreplaystats",
  visuais: "adsonpleal/latamvisuais",
  calc: "adsonpleal/ragcalc",
};

/** Onde cada repositório está clonado nesta máquina. */
export const PASTAS = {
  mercado: join(homedir(), "dev", "latam-market"),
  simulador: join(homedir(), "dev", "latam-ro-calc"),
  recap: join(homedir(), "dev", "ragreplaystats"),
  visuais: join(homedir(), "dev", "latamvisuais"),
  calc: join(homedir(), "dev", "ragcalc"),
};

// --- Estado local ----------------------------------------------------------

function leEstado() {
  try {
    return JSON.parse(readFileSync(ESTADO, "utf8"));
  } catch {
    return {};
  }
}

function gravaEstado(estado) {
  mkdirSync(dirname(ESTADO), { recursive: true });
  writeFileSync(ESTADO, `${JSON.stringify(estado, null, 2)}\n`);
}

// --- Firestore -------------------------------------------------------------

const str = (v) => ({ stringValue: v });
const bool = (v) => ({ booleanValue: v });
const ts = (v) => ({ timestampValue: new Date(v).toISOString() });

let tokenCache = null;
async function cabecalhos() {
  tokenCache ??= await accessToken();
  return { Authorization: `Bearer ${tokenCache}`, "Content-Type": "application/json" };
}

/**
 * Lista tudo e filtra na memória, em vez de montar um `runQuery` com `status ==`
 * e `orderBy criadoEm`: essa combinação exige índice composto, e o acervo tem
 * algumas centenas de cards. Uma listagem paginada custa o mesmo e não depende
 * de nada provisionado no console.
 */
async function todosOsCards() {
  const h = await cabecalhos();
  const docs = [];
  let pageToken = "";
  do {
    const url = `${BASE}/issues?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const r = await fetch(url, { headers: h });
    const j = await r.json();
    if (j.error) throw new Error(`Firestore: ${j.error.message}`);
    docs.push(...(j.documents ?? []));
    pageToken = j.nextPageToken ?? "";
  } while (pageToken);
  return docs.map(paraCard);
}

export function paraCard(doc) {
  const f = doc.fields ?? {};
  const s = (k) => f[k]?.stringValue ?? null;
  return {
    id: doc.name.split("/").pop(),
    updateTime: doc.updateTime,
    projeto: s("projeto"),
    titulo: s("titulo") ?? "",
    descricao: s("descricao") ?? "",
    tipo: s("tipo"),
    status: s("status"),
    autor: s("autor"),
    pr: s("pr"),
    arquivado: Boolean(f["arquivado"]?.booleanValue),
    auto: Boolean(f["auto"]?.booleanValue),
    criadoEm: f["criadoEm"]?.timestampValue ?? null,
  };
}

async function escreve(id, fields, { updateTime } = {}) {
  const mask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${f}`)
    .join("&");
  // A precondição é o que torna `pegar` seguro: se outro despachante mexeu no
  // card entre a leitura e esta escrita, o servidor recusa com 400/409 em vez
  // de os dois acharem que pegaram.
  const pre = updateTime ? `&currentDocument.updateTime=${encodeURIComponent(updateTime)}` : "";
  const r = await fetch(`${BASE}/issues/${id}?${mask}${pre}`, {
    method: "PATCH",
    headers: await cabecalhos(),
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) return { ok: false, corpo: (await r.text()).slice(0, 300) };
  return { ok: true };
}

async function comenta(id, texto) {
  const r = await fetch(`${BASE}/issues/${id}/comentarios`, {
    method: "POST",
    headers: await cabecalhos(),
    body: JSON.stringify({
      fields: {
        texto: str(texto),
        autor: str("Triagem automática"),
        autorUid: str("triagem-automatica"),
        tipo: str("mudanca"),
        criadoEm: ts(Date.now()),
      },
    }),
  });
  return r.ok;
}

// --- Regras da fila --------------------------------------------------------

/**
 * O que a automação pode pegar agora. `replay` fica de fora porque gravação não
 * é pedido de ninguém — é material de conferência, e nasce arquivada.
 */
export function maduros(cards, { desde, emVooMax = EM_VOO_MAX } = {}) {
  const emVoo = cards.filter((c) => !c.arquivado && c.auto && c.status === "em_progresso");
  const vagas = Math.max(0, emVooMax - emVoo.length);

  const fila = cards
    .filter((c) => !c.arquivado && c.status === "reportado" && c.tipo !== "replay")
    .filter((c) => c.projeto in REPOS)
    .filter((c) => !desde || (c.criadoEm && c.criadoEm > desde))
    .sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));

  return { fila, emVoo, vagas, pegaveis: fila.slice(0, vagas) };
}

// --- Comandos --------------------------------------------------------------

const comandos = {
  async bootstrap() {
    const desde = new Date().toISOString();
    const estado = { ...leEstado(), desde };
    gravaEstado(estado);
    const { fila } = maduros(await todosOsCards(), { desde: null });
    console.log(
      `marca d'água: ${desde}\n` +
        `${fila.length} card(s) em 'reportado' ficaram para trás — a automação não vai pegá-los.\n` +
        `estado em ${ESTADO}`,
    );
  },

  async fila() {
    const estado = leEstado();
    if (!estado.desde) throw new Error("sem marca d'água — rode 'bootstrap' primeiro");
    const r = maduros(await todosOsCards(), { desde: estado.desde });
    console.log(
      JSON.stringify(
        {
          desde: estado.desde,
          emVoo: r.emVoo.map((c) => ({ id: c.id, projeto: c.projeto, pr: c.pr })),
          vagas: r.vagas,
          pegaveis: r.pegaveis.map((c) => ({
            id: c.id,
            projeto: c.projeto,
            repo: REPOS[c.projeto],
            pasta: PASTAS[c.projeto],
            tipo: c.tipo,
            autor: c.autor,
            titulo: c.titulo,
            descricao: c.descricao,
            url: `https://issues.latam-tools.com.br/t/${c.id}`,
          })),
        },
        null,
        2,
      ),
    );
  },

  async pegar(id) {
    if (!id) throw new Error("uso: pegar <id>");
    const card = (await todosOsCards()).find((c) => c.id === id);
    if (!card) throw new Error(`card ${id} não existe`);
    if (card.status !== "reportado") throw new Error(`card ${id} está em '${card.status}', não em 'reportado'`);

    const r = await escreve(
      id,
      {
        status: str("em_progresso"),
        arquivado: bool(false),
        auto: bool(true),
        atualizadoEm: ts(Date.now()),
      },
      { updateTime: card.updateTime },
    );
    if (!r.ok) throw new Error(`não consegui pegar ${id} (outro pegou antes?): ${r.corpo}`);
    console.log(JSON.stringify({ ...card, status: "em_progresso", auto: true, repo: REPOS[card.projeto], pasta: PASTAS[card.projeto] }, null, 2));
  },

  async pr(id, ref) {
    if (!id || !ref) throw new Error("uso: pr <id> <dono/repo#N>");
    if (!/^[\w.-]+\/[\w.-]+#\d+$/.test(ref)) throw new Error(`referência inválida: ${ref} (esperado dono/repo#123)`);
    const r = await escreve(id, { pr: str(ref), atualizadoEm: ts(Date.now()) });
    if (!r.ok) throw new Error(`não consegui gravar o PR em ${id}: ${r.corpo}`);
    console.log(`${id} -> ${ref}`);
  },

  async parar(id, ...resto) {
    const i = resto.indexOf("--motivo");
    const motivo = i >= 0 ? resto[i + 1] : "";
    if (!id || !motivo) throw new Error('uso: parar <id> --motivo "texto"');
    // Vai para `backlog`, não para `nao_sera_feito`: fechar um card na cara de
    // quem reportou é decisão sua, não da automação. No backlog ele sai da fila
    // (que só olha `reportado`), não volta a ser pego e fica visível para você
    // decidir. O comentário fica no card, público, com o porquê.
    await comenta(id, motivo);
    const r = await escreve(id, { status: str("backlog"), arquivado: bool(false), atualizadoEm: ts(Date.now()) });
    if (!r.ok) throw new Error(`não consegui parar ${id}: ${r.corpo}`);
    console.log(`${id} -> backlog`);
  },

  async reconciliar(...args) {
    const seco = args.includes("--dry-run");
    const { execFileSync } = await import("node:child_process");
    const cards = (await todosOsCards()).filter(
      (c) => !c.arquivado && c.status === "em_progresso" && c.pr,
    );
    let movidos = 0;
    for (const c of cards) {
      const [repo, numero] = c.pr.split("#");
      let dados;
      try {
        dados = JSON.parse(
          execFileSync("gh", ["pr", "view", numero, "--repo", repo, "--json", "state,mergedAt,url"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }),
        );
      } catch (e) {
        console.error(`${c.id}: não consegui ler ${c.pr} — ${String(e.message).slice(0, 120)}`);
        continue;
      }
      if (dados.state !== "MERGED") continue;
      if (seco) {
        console.log(`[seco] ${c.id} <- ${c.pr} mesclado em ${dados.mergedAt}`);
        movidos++;
        continue;
      }
      await comenta(c.id, `Resolvido em ${dados.url}, mesclado em ${new Date(dados.mergedAt).toLocaleDateString("pt-BR")}.`);
      const r = await escreve(c.id, {
        status: str("resolvido"),
        arquivado: bool(false),
        atualizadoEm: ts(Date.now()),
      });
      if (!r.ok) {
        console.error(`${c.id}: ${r.corpo}`);
        continue;
      }
      console.log(`${c.id} -> resolvido (${c.pr})`);
      movidos++;
    }
    console.log(`reconciliados: ${movidos} de ${cards.length} card(s) com PR`);
  },

  async estado() {
    const estado = leEstado();
    const cards = await todosOsCards();
    const r = maduros(cards, { desde: estado.desde ?? null });
    console.log(
      `marca d'água : ${estado.desde ?? "(sem bootstrap)"}\n` +
        `em voo       : ${r.emVoo.length}/${EM_VOO_MAX}${r.emVoo.length ? ` — ${r.emVoo.map((c) => `${c.id}${c.pr ? ` (${c.pr})` : ""}`).join(", ")}` : ""}\n` +
        `fila madura  : ${r.fila.length}\n` +
        `pegáveis já  : ${r.pegaveis.length}\n` +
        `estado em    : ${ESTADO}`,
    );
  },
};

// --- Entrada ---------------------------------------------------------------

const [comando, ...args] = process.argv.slice(2);

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("triagem.mjs")) {
  if (!comando || !(comando in comandos)) {
    console.error(`comandos: ${Object.keys(comandos).join(", ")}`);
    process.exit(2);
  }
  try {
    await comandos[comando](...args);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
