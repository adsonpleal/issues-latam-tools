#!/usr/bin/env node
// Escuta o quadro e anuncia card novo numa linha por card.
//
//   node tools/escuta.mjs            # fica escutando; uma linha de stdout por card novo
//   node tools/escuta.mjs --marca    # só imprime a marca d'água guardada e sai
//
// Substitui o despachante agendado. A fila agendada acordava a cada 15 min para
// perguntar ao Firestore se havia card novo — 54 leituras por ciclo e um turno
// inteiro de modelo por pergunta, quase sempre para ouvir "não". Aqui o
// Firestore avisa: o snapshot inicial custa uma leitura por card em `reportado`
// (hoje menos de 20) e depois é uma leitura por mudança.
//
// **Cada linha do stdout vira uma notificação na sessão que escuta.** Por isso
// só sai linha quando há card novo de verdade, ou quando a escuta morre. Tudo
// que é diagnóstico vai para o stderr, que não notifica ninguém.
//
// Consulta SEM AUTENTICAÇÃO, com a identidade de um visitante anônimo, pelo
// mesmo motivo do anunciador do Discord: as regras liberam listar
// `arquivado == false` com `limit <= 500` e negam `privado/contato` a quem não é
// admin, então este processo NÃO CONSEGUE ler o contato de quem reportou, nem
// por engano. Credencial de admin passaria por cima das regras e jogaria essa
// garantia fora — quem move o card depois é o `triagem.mjs`, que é autenticado
// justamente porque escrever exige.
//
// Processo residente tem o defeito que o anunciador descreve: um poller pendurado
// fica "vivo" para sempre com os anúncios parados. Aqui quem corta isso é o
// relógio de quem arma a escuta — ela é reiniciada de tempos em tempos, e a marca
// d'água em disco faz o recomeço não perder nem repetir card.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { initializeApp } from "firebase/app";
import { collection, getFirestore, limit, onSnapshot, query, where } from "firebase/firestore";

import { REPOS, urlDoCard } from "./triagem.mjs";

/** Espelho de src/lib/firebase.ts. Chave web pública: já vai no bundle do site. */
const CONFIG = {
  apiKey: process.env["FIREBASE_API_KEY"] || "AIzaSyCcBw2edbq0x15csy4h4w_ZBZOGnpNvBro",
  projectId: process.env["FIREBASE_PROJECT_ID"] || "issues-latam-tools",
};

/**
 * Ao lado do `estado.json` do `triagem.mjs`, mas num arquivo só meu: ele guarda
 * o tópico do ntfy e a marca d'água do `bootstrap`, e duas escritas concorrentes
 * no mesmo arquivo perderiam uma das duas.
 */
const MARCA =
  process.env["ESCUTA_MARCA"] || join(homedir(), ".claude", "triagem-automatica", "escuta.json");

const ESTADO =
  process.env["TRIAGEM_ESTADO"] || join(homedir(), ".claude", "triagem-automatica", "estado.json");

// --- A regra, separada da rede ---------------------------------------------

/**
 * Instante puro, com os dois campos e mais nada. O `Timestamp` do SDK tem
 * `toJSON`, e gravá-lo direto enfiaria `type: "firestore/timestamp/1.0"` no meu
 * arquivo de estado — forma interna do SDK num arquivo que é meu, e que eu teria
 * de continuar aceitando se o SDK mudasse de ideia.
 */
export function instante(v) {
  if (!v || typeof v.seconds !== "number" || typeof v.nanoseconds !== "number") return null;
  return { seconds: v.seconds, nanoseconds: v.nanoseconds };
}

/**
 * Compara dois instantes do Firestore pelos campos crus, nunca por `Date`.
 * O Firestore carimba microssegundos e o `Date` trunca em milissegundos: uma
 * marca d'água truncada cai ANTES do card de onde saiu, e esse card volta a ser
 * novidade em todo recomeço, para sempre. O anunciador do Discord tem o mesmo
 * cuidado, pelo mesmo motivo.
 */
export function depois(a, b) {
  if (!b) return true;
  if (a.seconds !== b.seconds) return a.seconds > b.seconds;
  return a.nanoseconds > b.nanoseconds;
}

/**
 * O que é novidade neste snapshot, e a marca d'água que fica no lugar da antiga.
 *
 * `replay` fica de fora porque gravação não é pedido de ninguém, e projeto sem
 * repositório conhecido também — são os mesmos cortes que o `maduros` do
 * `triagem.mjs` faz, e é de propósito que eles não viram card aqui: quem decide
 * o que a automação pega continua sendo a fila, não a escuta.
 *
 * Card descartado **mexe na marca d'água do mesmo jeito**. Se não mexesse, ele
 * seria reexaminado em todo recomeço — barato, mas uma mentira sobre o que a
 * escuta já viu.
 */
export function novidades(cards, marca) {
  let fim = marca;
  const novos = [];
  for (const c of cards) {
    const criadoEm = instante(c.criadoEm);
    if (!criadoEm || !depois(criadoEm, marca)) continue;
    if (depois(criadoEm, fim)) fim = criadoEm;
    if (c.tipo === "replay") continue;
    if (!(c.projeto in REPOS)) continue;
    novos.push(c);
  }
  return { novos, marca: fim };
}

/** Uma linha por card, e ela é lida por gente no celular — id primeiro, link no fim. */
export function linha(card) {
  return `NOVO ${card.id} | ${card.projeto} | ${card.titulo} | ${urlDoCard(card.id)}`;
}

// --- Disco ------------------------------------------------------------------

function leJson(caminho) {
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Primeira marca d'água: a do `bootstrap`, no `estado.json`. Sem ela a escuta
 * despejaria o quadro inteiro na primeira vez — exatamente a pilha de
 * `reportado` que o `bootstrap` existe para deixar onde está.
 */
function marcaInicial() {
  const guardada = instante(leJson(MARCA).marca);
  if (guardada) return guardada;
  const desde = leJson(ESTADO).desde;
  if (!desde) throw new Error(`sem marca d'água — rode 'triagem bootstrap' primeiro (${ESTADO})`);
  const ms = Date.parse(desde);
  return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 };
}

/** Grava por rename, que é atômico: recomeço no meio da escrita não lê meia marca. */
function gravaMarca(marca) {
  mkdirSync(dirname(MARCA), { recursive: true });
  const tmp = `${MARCA}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ marca }, null, 2)}\n`);
  renameSync(tmp, MARCA);
}

// --- Escuta -----------------------------------------------------------------

function morre(texto, codigo = 1) {
  // Vai para o stdout de propósito, ao contrário do resto do diagnóstico: escuta
  // que morreu calada é indistinguível de quadro parado, e é esse o silêncio que
  // não pode acontecer.
  console.log(`ESCUTA MORREU: ${texto}`);
  process.exit(codigo);
}

function escuta() {
  let marca = marcaInicial();
  process.stderr.write(`escutando a partir de ${marca.seconds}.${marca.nanoseconds}\n`);

  const db = getFirestore(initializeApp(CONFIG));
  const consulta = query(
    collection(db, "issues"),
    // `arquivado == false` não é filtro nosso, é exigência da regra: `list` é
    // avaliado contra a CONSULTA, e sem ele o Firestore recusa tudo.
    where("arquivado", "==", false),
    where("status", "==", "reportado"),
    limit(500),
  );

  onSnapshot(
    consulta,
    { includeMetadataChanges: false },
    (snap) => {
      const cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const r = novidades(cards, marca);
      for (const c of r.novos) console.log(linha(c));
      if (r.marca !== marca) {
        marca = r.marca;
        gravaMarca(marca);
      }
    },
    (e) => morre(`${e.code || "erro"} — ${e.message}`),
  );
}

/**
 * A guarda é a do anunciador, com `pathToFileURL`, e não a comparação por
 * `file://${argv[1]}`: no Windows o caminho vem com barra invertida e letra de
 * unidade, e a forma crua nunca casa. Sem guarda nenhuma, importar este módulo
 * — o teste importa — abria um listener de verdade no Firestore.
 */
const executadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  if (process.argv.includes("--marca")) {
    process.stdout.write(`${JSON.stringify(marcaInicial())}\n`);
  } else {
    try {
      escuta();
    } catch (e) {
      morre(e.message);
    }
  }
}
