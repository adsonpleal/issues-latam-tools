#!/usr/bin/env node
// A fila da triagem automática: o quadro é a própria fila.
//
//   node tools/triagem.mjs bootstrap            # marca d'água = agora, não pega nada do passado
//   node tools/triagem.mjs fila                 # o que está maduro para pegar, em JSON
//   node tools/triagem.mjs pegar <id>           # backlog -> em_progresso, trava o card
//   node tools/triagem.mjs pr <id> <dono/repo#N>
//   node tools/triagem.mjs parar <id> --motivo "..."   # recusa: fica em backlog, auto: false
//   node tools/triagem.mjs reconciliar          # PR mesclado -> resolvido
//   node tools/triagem.mjs avisar <id> --mensagem "..."  # notificação no celular
//   node tools/triagem.mjs alarme --mensagem "..."       # idem, sem card: o despachante
//   node tools/triagem.mjs estado               # o que a automação enxerga agora
//
// Não há fila em arquivo à parte, e isso é a decisão central: `status` no
// Firestore É a fila. Pegar um card é movê-lo para `em_progresso`, e o
// Firestore recusa a segunda escrita (precondição de updateTime), então dois
// despachantes simultâneos não podem pegar o mesmo card. De quebra, você vê a
// fila no quadro e tira um card dela arrastando — sem mexer em nada aqui.
//
// The queue reads `backlog`, never `reportado`, and that is the whole defence
// against a card written to be read by an agent. A stranger can only create a
// card in `reportado` -- the rules pin `status == 'reportado'` on public create
// and allow the public nothing but `upvotes += 1` afterwards -- so no text
// reaches this automation until Adson has read it and moved it himself.
// Placement in `backlog` IS the authorization, and it arrives through a channel
// an attacker cannot write to.
//
// The watermark is keyed on `atualizadoEm` (when a card was moved) and not on
// `criadoEm` (when it was filed), because a card approved today may have been
// reported weeks ago.
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

const SITE = "https://issues.latam-tools.com.br";
/** Where the notification and the listener point. Exported so it is not two constants. */
export const urlDoCard = (id) => `${SITE}/t/${encodeURIComponent(id)}`;

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
 * Only the two statuses the queue can see: `backlog` (what it may take) and
 * `em_progresso` (what is already in flight). `reportado` is deliberately not
 * fetched -- not filtered out downstream, not fetched -- so a card nobody has
 * reviewed has no code path into this process at all. Single-field filter, so
 * it uses the automatic index; the ordering stays in memory, in `maduros`,
 * precisely to avoid needing a composite one.
 *
 * Antes isto listava a coleção inteira. Como `fila` e `reconciliar` chamam a
 * cada ciclo do despachante, eram ~580 leituras a cada 15 min: a cota diária do
 * plano gratuito acabava no meio da tarde, e ela é a **mesma** cota do quadro
 * público — a automação derrubava o site para os visitantes.
 */
async function cardsAtivos() {
  const r = await fetch(`${BASE}:runQuery`, {
    method: "POST",
    headers: await cabecalhos(),
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "issues" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "status" },
            op: "IN",
            value: { arrayValue: { values: [str("backlog"), str("em_progresso")] } },
          },
        },
      },
    }),
  });
  return cardsDaConsulta(await r.json());
}

/**
 * O `runQuery` responde em lista, e **o erro também vem como linha dentro dela**:
 * cota estourada chega como `[{ error: { code: 429, ... } }]`, não como objeto
 * solto. Quem olhar só `corpo.error` lê isso como "nenhum card" e faz a fila
 * anunciar que não há o que fazer — falha silenciosa, no caminho que justamente
 * existe para avisar.
 */
export function cardsDaConsulta(corpo) {
  const falha = Array.isArray(corpo) ? corpo.find((l) => l.error)?.error : corpo?.error;
  if (falha) throw new Error(`Firestore: ${falha.message}`);
  if (!Array.isArray(corpo)) throw new Error(`Firestore: runQuery devolveu ${typeof corpo}, não uma lista`);
  // Consulta sem resultado devolve uma linha só com `readTime`, sem documento.
  return corpo.filter((l) => l.document).map((l) => paraCard(l.document));
}

/** Um card pelo id: uma leitura, em vez de varrer a coleção atrás dele. */
async function buscaCard(id) {
  const r = await fetch(`${BASE}/issues/${encodeURIComponent(id)}`, { headers: await cabecalhos() });
  if (r.status === 404) throw new Error(`card ${id} não existe`);
  const j = await r.json();
  if (j.error) throw new Error(`card ${id}: ${j.error.message}`);
  if (!r.ok) throw new Error(`card ${id}: HTTP ${r.status}`);
  return paraCard(j);
}

/** `--flag valor`, como o resto da automação já escreve na linha de comando. */
const flag = (args, nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : "";
};

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
    // Set by `parar` when the automation refuses a card Adson approved. It is a
    // field of its own and not `auto: false`, because an absent `auto` already
    // reads as `false` on the line above -- that is every card nobody picked.
    refused: Boolean(f["refused"]?.booleanValue),
    criadoEm: f["criadoEm"]?.timestampValue ?? null,
    // When the card last moved, which for a card in `backlog` is when Adson
    // approved it. The queue's watermark keys on this, not on `criadoEm`.
    atualizadoEm: f["atualizadoEm"]?.timestampValue ?? null,
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

// --- Aviso no celular ------------------------------------------------------

/**
 * Para onde o toque na notificação leva.
 *
 * A regra é a única coisa que o Adson precisa saber de cor: **se o PR existe, o
 * link é o PR; se não existe, é o card.** Um aviso que chega sem PR é um card
 * que não virou PR — relato que não procede, ou sessão que travou —, e o que ele
 * precisa ler nesse caso é justamente o comentário que a triagem acabou de
 * deixar no card. Mandá-lo para o GitHub ali seria mandá-lo para lugar nenhum.
 *
 * Quem decide não é o texto que a sessão escreve, é o campo `pr` do card. Não dá
 * para a sessão errar o link elogiando um PR que ela não abriu.
 */
export function linkDoAviso(card) {
  if (!card.pr) return urlDoCard(card.id);
  const [repo, numero] = card.pr.split("#");
  return `https://github.com/${repo}/pull/${numero}`;
}

/**
 * O tópico do ntfy, que **não tem padrão no código de propósito**. Este
 * repositório é público, e tópico do ntfy é senha de quem publica: quem souber o
 * nome manda notificação para o celular dele, com `click` para qualquer URL —
 * um pescador perfeito. Então ele mora onde o resto do estado da automação já
 * mora, fora do repositório (`estado.json`), ou na variável de ambiente.
 */
function topico() {
  const t = process.env["TRIAGEM_NTFY_TOPICO"] || leEstado().ntfyTopico;
  if (!t) throw new Error(`sem tópico do ntfy — grave 'ntfyTopico' em ${ESTADO} ou defina TRIAGEM_NTFY_TOPICO`);
  return t;
}

/**
 * Publica em JSON na raiz do ntfy, e não com os cabeçalhos `Title`/`Click` no
 * POST do tópico: cabeçalho HTTP não carrega UTF-8, e título de card daqui vem
 * acentuado ("Localização", "Colisão Astral"). Pelo caminho dos cabeçalhos ele
 * chegaria ao celular truncado ou em mojibake.
 *
 * Com prazo, ao contrário das escritas no Firestore aqui em cima: este é o
 * último passo da sessão, e um POST pendurado deixaria o card resolvido sem
 * ninguém avisado.
 */
async function notifica({ titulo, mensagem, link, tags }) {
  const r = await fetch("https://ntfy.sh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: topico(), title: titulo, message: mensagem, click: link, tags }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return { ok: false, corpo: (await r.text()).slice(0, 300) };
  return { ok: true };
}

// --- Screening for prompt injection ---------------------------------------

/**
 * The board is public: anybody can file a card. A card's `titulo` and
 * `descricao` are then pasted verbatim into the brief of a session that runs
 * unattended with write access to the board, `git push` and `gh`. So a card is
 * text from a stranger that reaches a tool-using agent, and some of it may be
 * addressed to that agent rather than describing a bug.
 *
 * This runs **before** any model reads the card, and that ordering is the whole
 * point: a detector that asks a model "is this an injection?" has already fed
 * it the injection. `maduros` and `pegar` are the only two ways a card becomes
 * a session, so both consult this, independently — the dispatcher can call
 * `pegar <id>` straight past the queue, and has.
 *
 * It is a speed bump, not a wall. This repository is public, so these patterns
 * are public too, and whoever reads them can write around them. The defences
 * that actually hold are the two behind it: the triage skill treats card text
 * as data and never as instructions, and a screened card waits for a person.
 * What this buys is that the careless attempt never reaches an agent at all.
 *
 * Biased towards flagging, because the two mistakes do not cost the same. A
 * false positive costs Adson a glance at one card. A false negative hands a
 * stranger's instructions to a process that can push code.
 */

/**
 * Zero-width characters and bidi overrides, checked on the raw text because
 * normalising strips them. A bug report has no use for either, while hiding
 * text from the person reviewing the card is exactly what they are good for.
 */
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/u;

/** NFKC folds full-width and compatibility forms onto the letters the rules match. */
function normalize(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[​-‏‪-‮⁠-⁩﻿]/gu, "")
    .toLowerCase();
}

/**
 * Each rule names what it suspects, so whoever reads the flag learns why
 * without re-reading the card hunting for it. The patterns cover both
 * languages: the board is answered in Portuguese and may be attacked in either.
 */
const SCREEN_RULES = [
  {
    rule: "agent-instruction",
    // "ignore the above", "esqueça as instruções anteriores", "you are now a…"
    pattern:
      /\b(ignore|ignora|disregard|forget|esque[çc]a|desconsidere)\b[^.\n]{0,40}\b(previous|prior|above|earlier|instruc|instru[çc])|you are now|from now on you|a partir de agora,? (voc[êe]|tu)|new instructions|novas instru[çc][õo]es|system prompt|prompt do sistema|\bact as\b|\baja como\b/u,
  },
  {
    rule: "role-markup",
    // Trying to close the data block and speak as the system or the assistant.
    pattern:
      /<\/?system|<\|[a-z_]|\[\/?inst\]|#{2,}\s*instruction|^\s*(human|assistant|user|system)\s*:|<function_calls|<\/?tool_use|<\/?antml:/imu,
  },
  {
    rule: "tool-request",
    // A bug report does not ask for a shell.
    pattern:
      /--no-verify|rm\s+-rf|\bcurl\s|\bwget\s|gh\s+(pr\s+merge|auth)|push\s+--force|--force-with-lease|npm\s+publish|\bchmod\s|\bsudo\s|\bfirebase\b|\bfirestore\b|process\.env/u,
  },
  {
    rule: "secret",
    // Fishing for what the session can reach and the reporter cannot.
    pattern:
      /\btokens?\b|\bsecrets?\b|\bcredenciais?\b|\bcredentials?\b|\bsenhas?\b|\bid_rsa\b|\.env\b|private key|chave privada|service account|api[\s_-]?key|chave de api|\bakia[0-9a-z]{16}/u,
  },
  {
    rule: "false-authority",
    // Authority cannot arrive inside the thing being screened.
    pattern:
      /autoriza(do|ção) (por|pelo)|\badson\b[^.\n]{0,30}\b(pediu|autorizou|aprovou|disse|mandou)|\badson\b[^.\n]{0,20}\b(said|asked|approved|authoriz)|admin override|sou o (dono|administrador)|\b(i am|i'm) the (owner|admin)|on behalf of|em nome d(o|a)/u,
  },
  {
    rule: "secrecy",
    // Asking the session to hide what it did is asking it to defeat the review.
    pattern:
      /n[ãa]o (avise|comente|informe|conte|mencione|diga)|sem (avisar|comentar|notificar)|do ?n[o']?t tell|don't mention|without notifying|\bsilently\b|\bquietly\b|em sigilo|secretamente/u,
  },
];

/**
 * Screens the three fields that reach an agent: `titulo` and `descricao` go
 * into the brief, and `autor` goes into a pull request body as the credit line.
 *
 * Returns `null` for a card that reads like a bug report, or
 * `{ rule, field, excerpt }` naming the rule, the field it fired on, and
 * enough text around the match to judge it by. The excerpt is what makes
 * dismissing a false positive cheap.
 */
export function screenForInjection(card) {
  for (const field of ["titulo", "descricao", "autor"]) {
    const raw = String(card?.[field] ?? "");
    if (!raw) continue;

    if (INVISIBLE.test(raw)) {
      return { rule: "invisible-characters", field, excerpt: around(raw, raw.search(INVISIBLE)) };
    }

    const text = normalize(raw);
    for (const { rule, pattern } of SCREEN_RULES) {
      const hit = pattern.exec(text);
      if (hit) return { rule, field, excerpt: around(text, hit.index) };
    }
  }
  return null;
}

/** Sixty characters around the match: enough to read the sentence, not the essay. */
function around(text, index) {
  const start = Math.max(0, index - 20);
  return (
    (start > 0 ? "…" : "") +
    text.slice(start, index + 60).replace(/\s+/g, " ").trim() +
    (index + 60 < text.length ? "…" : "")
  );
}

// --- Regras da fila --------------------------------------------------------

/**
 * What the automation may take right now: cards Adson has moved to `backlog`
 * himself. `replay` stays out because a recording is nobody's request -- it is
 * review material, and it is born archived.
 */
export function maduros(cards, { desde, emVooMax = EM_VOO_MAX } = {}) {
  const emVoo = cards.filter((c) => !c.arquivado && c.auto && c.status === "em_progresso");
  const vagas = Math.max(0, emVooMax - emVoo.length);

  const candidates = cards
    .filter((c) => !c.arquivado && c.status === "backlog" && c.tipo !== "replay")
    .filter((c) => c.projeto in REPOS)
    // `parar` leaves a refused card in `backlog` with `refused: true`. Without
    // this the queue would hand it to a fresh session every cycle, forever.
    .filter((c) => !c.refused)
    // Keyed on `atualizadoEm`, the moment the card was moved into `backlog`.
    // Keying on `criadoEm` would silently drop every older card Adson approves
    // -- the same shape of silent drop that kept the announcer quiet for
    // thirteen days.
    .filter((c) => !desde || ((c.atualizadoEm ?? c.criadoEm) > desde))
    .sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));

  // A backstop, not the gate. A person read this card before it reached the
  // queue, so what is left for a regex to catch is what a tired reviewer skims
  // past, not the obvious attempt. A screened card stays in `backlog` and out
  // of the queue, with no public comment: naming the rule that caught it would
  // tell whoever wrote it what to avoid next time.
  const blocked = [];
  const fila = [];
  for (const c of candidates) {
    const screen = screenForInjection(c);
    if (screen) blocked.push({ ...c, screen });
    else fila.push(c);
  }

  return { fila, emVoo, vagas, pegaveis: fila.slice(0, vagas), blocked };
}

// --- Comandos --------------------------------------------------------------

const comandos = {
  async bootstrap() {
    const desde = new Date().toISOString();
    const estado = { ...leEstado(), desde };
    gravaEstado(estado);
    const { fila } = maduros(await cardsAtivos(), { desde: null });
    console.log(
      `marca d'água: ${desde}\n` +
        `${fila.length} card(s) em 'backlog' ficaram para trás — a automação não vai pegá-los.\n` +
        `estado em ${ESTADO}`,
    );
  },

  async fila() {
    const estado = leEstado();
    if (!estado.desde) throw new Error("sem marca d'água — rode 'bootstrap' primeiro");
    const r = maduros(await cardsAtivos(), { desde: estado.desde });
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
            url: urlDoCard(c.id),
          })),
          barrados: r.blocked.map((c) => ({
            id: c.id,
            projeto: c.projeto,
            titulo: c.titulo,
            ...c.screen,
            url: urlDoCard(c.id),
          })),
        },
        null,
        2,
      ),
    );
  },

  async pegar(id) {
    if (!id) throw new Error("uso: pegar <id>");
    const card = await buscaCard(id);
    if (card.status !== "backlog") {
      throw new Error(
        `card ${id} is in '${card.status}', not 'backlog' -- the automation only takes what you moved there yourself`,
      );
    }

    // Checked here as well as in `maduros`, because a dispatcher can call
    // `pegar <id>` straight past the queue — and has.
    const screen = screenForInjection(card);
    if (screen) {
      throw new Error(
        `card ${id} refused by the injection screen: ${screen.rule} in \`${screen.field}\` — ` +
          `"${screen.excerpt}". Read the card and decide by hand; the automation will not take it.`,
      );
    }

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
    const motivo = flag(resto, "--motivo");
    if (!id || !motivo) throw new Error('uso: parar <id> --motivo "texto"');
    // Stays in `backlog`, and `refused: true` is what takes it out of the queue.
    // Not `nao_sera_feito`, because closing a card in the reporter's face is
    // your decision and not the automation's. Not back to `reportado` either:
    // your judgement that this is a real bug still stands, and the automation
    // failing to fix it does not un-make it. The public comment, in the
    // reporter's language, says why.
    await comenta(id, motivo);
    const r = await escreve(id, {
      status: str("backlog"),
      refused: bool(true),
      arquivado: bool(false),
      atualizadoEm: ts(Date.now()),
    });
    if (!r.ok) throw new Error(`não consegui parar ${id}: ${r.corpo}`);
    console.log(`${id} -> backlog (refused)`);
  },

  async reconciliar(...args) {
    const seco = args.includes("--dry-run");
    const { execFileSync } = await import("node:child_process");
    const cards = (await cardsAtivos()).filter(
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

  /**
   * O aviso de fim de card. A sessão escreve a frase; o link não é dela — sai do
   * card, por `linkDoAviso`. Uma notificação por card, no fim: progresso não vai
   * para o celular de ninguém.
   *
   * O id é obrigatório, e `--mensagem` no lugar dele é erro em vez de virar
   * alarme: `avisar "$ID" --mensagem ...` com a variável vazia precisa falhar,
   * não mandar uma notificação genérica que parece ter dado certo.
   */
  async avisar(id, ...resto) {
    const mensagem = flag(resto, "--mensagem");
    if (!id || id.startsWith("--") || !mensagem) throw new Error('uso: avisar <id> --mensagem "texto"');

    const card = await buscaCard(id);
    const link = linkDoAviso(card);
    const r = await notifica({
      titulo: card.titulo || card.id,
      mensagem,
      link,
      // O projeto vira etiqueta em vez de entrar no título: na tela do celular o
      // título é o que se lê primeiro, e ali o que importa é o card.
      tags: [card.projeto, card.pr ? "rocket" : "speech_balloon"],
    });
    if (!r.ok) throw new Error(`não consegui avisar sobre ${id}: ${r.corpo}`);
    console.log(`avisado: ${id} -> ${link}`);
  },

  /** O alarme do próprio despachante, que não tem card para apontar. */
  async alarme(...resto) {
    const mensagem = flag(resto, "--mensagem");
    if (!mensagem) throw new Error('uso: alarme --mensagem "texto"');
    const r = await notifica({ titulo: "Triagem automática", mensagem, link: SITE, tags: ["warning"] });
    if (!r.ok) throw new Error(`não consegui dar o alarme: ${r.corpo}`);
    console.log(`alarme -> ${SITE}`);
  },

  async estado() {
    const estado = leEstado();
    const cards = await cardsAtivos();
    const r = maduros(cards, { desde: estado.desde ?? null });
    console.log(
      `marca d'água : ${estado.desde ?? "(sem bootstrap)"}\n` +
        `em voo       : ${r.emVoo.length}/${EM_VOO_MAX}${r.emVoo.length ? ` — ${r.emVoo.map((c) => `${c.id}${c.pr ? ` (${c.pr})` : ""}`).join(", ")}` : ""}\n` +
        `fila madura  : ${r.fila.length}\n` +
        `pegáveis já  : ${r.pegaveis.length}\n` +
        // Shown here and in `fila`, and deliberately NOT pushed to the phone:
        // a notification per screened card would hand a stranger a way to ring
        // Adson's phone at will, by filing cards. The dispatcher reads this
        // every cycle, which is where a blocked card belongs.
        `barrados     : ${r.blocked.length}${r.blocked.length ? ` — ${r.blocked.map((c) => `${c.id} (${c.screen.rule})`).join(", ")}` : ""}
` +
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
