#!/usr/bin/env node
// Anuncia no Discord os cards novos do quadro público.
//
//   node tools/anunciar-discord.mjs --dry-run --desde 2020-01-01T00:00:00Z --max 100
//   node tools/anunciar-discord.mjs --bootstrap
//   node tools/anunciar-discord.mjs
//
// Roda como one-shot do systemd a cada 2 min (infra/issues-discord.timer). É
// one-shot e não processo residente de propósito: um fetch pendurado morre no
// TimeoutStartSec e o próximo tique começa limpo, enquanto um poller com
// setInterval fica verde no systemctl para sempre com os anúncios parados.
//
// Consulta o Firestore SEM AUTENTICAÇÃO, com a identidade de um visitante
// anônimo. As regras liberam listar `arquivado == false` com `limit <= 500` e
// negam `privado/contato` a quem não é admin — ou seja, este processo NÃO
// CONSEGUE ler o contato de quem reportou, nem por engano. A privacidade é
// garantida pelo Firestore, não pela nossa disciplina. É por isso que aqui não
// entra firebase-admin nem service account: credencial de admin passa por cima
// das regras e jogaria essa garantia fora.
//
// Efeito colateral desejado: gravações (`tipo: "replay"`) nascem arquivadas, e
// portanto nunca aparecem nesta consulta.
//
// Each announcement gets a thread, and the card is then followed: when a pull
// request is recorded on it, or its status moves, that is posted into the
// thread. Both fields are public and only read, so none of this costs the
// anonymous identity above — the point of which is that this process CANNOT
// read a reporter's contact even by mistake.

import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// --- Configuração ----------------------------------------------------------

const env = process.env;
const PROJECT_ID = env.FIREBASE_PROJECT_ID || "issues-latam-tools";
// Chave web pública: já vai no bundle do site (src/lib/firebase.ts). Não é
// segredo — quem manda no acesso são as regras, não ela.
const API_KEY = env.FIREBASE_API_KEY || "AIzaSyCcBw2edbq0x15csy4h4w_ZBZOGnpNvBro";
const CANAL = env.DISCORD_CHANNEL_ID || "1538690478751354880";
const TOKEN = env.DISCORD_BOT_TOKEN || "";
const SITE_URL = env.SITE_URL || "https://issues.latam-tools.com.br";
const ESTADO_PADRAO = env.ESTADO || "/var/lib/issues-discord/estado.json";
/**
 * The deadman's way out of Discord, and it has **no default in the code on
 * purpose**: this repository is public, and an ntfy topic is the password of
 * whoever publishes to it. Same reasoning as `topico()` in `tools/triagem.mjs`.
 * Comes from a root-only systemd drop-in, like the bot token, and is never
 * logged.
 */
const NTFY_TOPICO = env.NTFY_TOPICO || "";

/** Espelho de src/lib/projetos.ts. O teste falha se as duas tabelas divergirem. */
export const PROJETOS = {
  mercado: { nome: "Mercado", cor: "#3fa96c" },
  simulador: { nome: "Simulador", cor: "#d1683f" },
  recap: { nome: "Recap", cor: "#7a5fd1" },
  visuais: { nome: "Visuais", cor: "#3f6cd1" },
  calc: { nome: "Calculadoras", cor: "#c9a227" },
};

/** Espelho de LABEL_TIPO em src/i18n.ts. Idem: o teste cobra a igualdade. */
export const LABEL_TIPO = { bug: "Bug", feature: "Sugestão", replay: "Gravação" };

const COR_DESCONHECIDA = 0x5865f2; // blurple do Discord
const TITULO_MAX = 200;
const DESCRICAO_MAX = 500;
const LINHAS_MAX = 8;
const IDS_GUARDADOS = 200;
const FALHAS_PARA_ALERTA = 10;

/**
 * Saturation is a RATE, and these two say which rate. The guard used to fire on
 * "the query page came back full", which conflated a spam burst with a backlog —
 * and since the watermark only moves when something is posted, a backlog over
 * one page blocked every run forever and grew more certain to block the next.
 * That is how this service spent 12 days red. A window and a count cannot
 * deadlock: a backlog spread over days is not a burst in any window.
 */
const SATURACAO_JANELA_MS = 15 * 60 * 1000;
const SATURACAO_MAX = 10;

/** Thread title cap in the Discord API. */
const TOPICO_NOME_MAX = 100;
/** 7 days. Posting into an archived thread un-archives it, so this is cosmetic. */
const TOPICO_ARQUIVA_MIN = 10080;
/**
 * How many announced cards keep a thread being followed. The cap is what stops
 * `estado.json` growing without bound; a card leaves earlier than this the
 * moment it reaches a final status.
 */
const ACOMPANHADOS_MAX = 60;
/**
 * Follow-ups are not checked on every run. Each check costs one Firestore read
 * per followed card and this service wakes 720 times a day — reading
 * everything every tick is what exhausted the free quota once already. Ten
 * minutes is the delay for a pull request to show up in its thread, and the
 * interval is a clock rather than a tick counter so a quiet run still writes
 * nothing to disk.
 */
const CHECAGEM_INTERVALO_MS = 10 * 60 * 1000;

// --- Campos tipados do Firestore -------------------------------------------

/**
 * A REST devolve todo campo embrulhado no tipo (`{"stringValue": "..."}`).
 * `integerValue` chega como STRING, e `timestampValue` NUNCA vira Date aqui:
 * o Firestore emite microssegundos e o Date trunca em milissegundos, o que faria
 * o marco d'água ficar antes do card de onde veio e reanunciá-lo para sempre.
 */
export function valor(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(valor);
  if ("mapValue" in v) {
    return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, valor(x)]));
  }
  return null;
}

export function documentoParaCard(doc) {
  const f = doc.fields ?? {};
  return {
    id: doc.name.split("/").pop(),
    projeto: valor(f.projeto),
    tipo: valor(f.tipo),
    titulo: valor(f.titulo) ?? "",
    descricao: valor(f.descricao) ?? "",
    autor: valor(f.autor) ?? null,
    criadoEm: valor(f.criadoEm) ?? null,
    // Both public fields, and both only read: the follow-up in a card's thread
    // is built from these two. Nothing here reaches `privado/contato`, which
    // the rules deny this anonymous identity anyway.
    status: valor(f.status) ?? null,
    pr: valor(f.pr) ?? null,
  };
}

/**
 * Comparar timestamp RFC3339 como string crua não funciona: "…34Z" sai depois de
 * "…34.5Z" no lexicográfico, porque 'Z' > '.'. Normaliza a fração para nove
 * casas antes de comparar. Só para ordenar — o que se guarda e se reenvia é
 * sempre a string original.
 */
export function chaveOrdem(ts) {
  if (typeof ts !== "string") return "";
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/.exec(ts);
  if (!m) return ts;
  return `${m[1]}.${(m[2] ?? "").padEnd(9, "0")}`;
}

// --- Saneamento do texto do usuário ----------------------------------------

// `titulo` e `descricao` são escrita pública ANÔNIMA sendo repassada para um
// canal sob a identidade de um bot em que a comunidade confia. Trate todo
// caractere como hostil.

/** Invisíveis: controle (menos \n), zero-width, marcas de direção bidi. */
const INVISIVEIS = /[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uE000]/g;
// Não engole a pontuação final: com `\S+` um link entre parênteses levava o `)`
// junto e a frase ficava com parêntese aberto para sempre.
const URLS =
  /\b(?:https?:\/\/|www\.|discord\.gg\/|discord(?:app)?\.com\/invite\/)(?:[^\s<>]*[^\s<>.,;:!?)\]}])?/gi;
const SENTINELA = "\uE000"; // marca a URL removida atravessar o escape intacta

/**
 * Escapa só o que forma markup: negrito, itálico, tachado, spoiler, código,
 * link mascarado e menção. `:` `(` `)` `.` ficam de fora de propósito — escapar
 * tudo encheria um texto normal em português de contrabarras visíveis, e sem
 * `[` `]` não dá para montar `[texto](link-ruim)` de qualquer jeito.
 */
function escapaMarkdown(texto) {
  return texto.replace(/([\\*_~`|[\]<>])/g, "\\$1").replace(/^#/gm, "\\#");
}

export function sanitizarDescricao(texto) {
  if (typeof texto !== "string") return "";
  let s = texto.replace(/\t/g, " ").replace(INVISIVEIS, "");
  // Descrição de embed transforma URL solta em link clicável — então nenhuma
  // URL do usuário sai daqui. Quem quiser ver clica no permalink do card, onde
  // TextoComLinks.tsx já as trata sob as regras do site.
  s = s.replace(URLS, SENTINELA);
  s = escapaMarkdown(s);
  s = s.split(SENTINELA).join("[link]");
  s = s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  const linhas = s.split("\n");
  if (linhas.length > LINHAS_MAX) s = linhas.slice(0, LINHAS_MAX).join("\n");
  return s.trim();
}

/** Título de embed não renderiza markdown, então escapar só sujaria a tela. */
export function sanitizarTitulo(texto) {
  if (typeof texto !== "string") return "";
  return texto.replace(INVISIVEIS, "").replace(/\s+/g, " ").trim();
}

/**
 * Corta por code point (`[...s]`), não por `slice`: cortar no meio de um par
 * substituto parte o emoji ao meio e vira glifo de erro. Recua até o último
 * espaço se houver um perto do fim, para não terminar em palavra picada.
 */
export function truncar(texto, max) {
  const chars = [...texto];
  if (chars.length <= max) return texto;
  const corte = chars.slice(0, max);
  const ultimoEspaco = corte.lastIndexOf(" ");
  // O `>= 0` não é decoração: sem ele um texto sem espaço nenhum cai em
  // `slice(0, -1)` e perde o último caractere.
  const dentroDaJanela = ultimoEspaco >= 0 && ultimoEspaco > max - 60;
  const fim = dentroDaJanela ? ultimoEspaco : corte.length;
  return `${corte.slice(0, fim).join("").trimEnd()}…`;
}

// --- A mensagem ------------------------------------------------------------

export function montarMensagem(card) {
  const projeto = PROJETOS[card.projeto];
  const rotuloTipo = LABEL_TIPO[card.tipo] ?? card.tipo ?? "?";
  const cor = projeto ? parseInt(projeto.cor.slice(1), 16) : COR_DESCONHECIDA;
  const autor = typeof card.autor === "string" ? sanitizarTitulo(card.autor) : "";
  const descricao = truncar(sanitizarDescricao(card.descricao), DESCRICAO_MAX);

  const embed = {
    author: { name: truncar(`${projeto ? projeto.nome : card.projeto} · ${rotuloTipo}`, 256) },
    title: truncar(sanitizarTitulo(card.titulo), TITULO_MAX) || "(sem título)",
    url: `${SITE_URL}/t/${encodeURIComponent(card.id)}`,
    color: cor,
    // Rodapé não renderiza markdown nem menção: é o lugar mais seguro para o
    // nick, que é texto do usuário.
    footer: { text: truncar(autor ? `Reportado por ${autor} · ${host()}` : host(), 2048) },
  };
  if (descricao) embed.description = descricao;
  if (card.criadoEm) embed.timestamp = card.criadoEm;

  return {
    // Sem isto um `@everyone` no título tocaria o servidor inteiro. Nenhum dos
    // cinco scripts irmãos faz isso; aqui o texto é anônimo, então é obrigatório.
    allowed_mentions: { parse: [] },
    // Deixa o próprio Discord descartar a repetição quando a gravação do estado
    // cai entre o 2xx e o fsync. Janela curta e não documentada — é reforço, não
    // a garantia; a garantia é a lista `anunciados`.
    nonce: createHash("sha1").update(card.id).digest("hex").slice(0, 25),
    enforce_nonce: true,
    embeds: [embed],
  };
}

function host() {
  return SITE_URL.replace(/^https?:\/\//, "");
}

// --- Tópico do card --------------------------------------------------------

/**
 * A thread hangs off the announcement so the conversation about a report, and
 * the pull request that closes it, stay with the report instead of scrolling
 * away in the channel. The name is the card's title and nothing else: Discord
 * shows it in the thread list, where a prefix would only eat the 100 chars.
 */
export function nomeDoTopico(card) {
  // `truncar` adds an ellipsis, so it returns max + 1 code points. The embed
  // title can absorb that; a thread name cannot — 100 is a hard cap in the API
  // and 101 comes back 400. Hence the -1.
  return truncar(sanitizarTitulo(card.titulo), TOPICO_NOME_MAX - 1) || "(sem título)";
}

/**
 * `owner/repo#N` is how `tools/triagem.mjs` writes the `pr` field. Validate it
 * instead of trusting it: this builds a link that gets posted under the bot's
 * identity, and a field is a field — anything that does not match exactly is
 * dropped rather than linked.
 */
export function urlDoPr(ref) {
  if (typeof ref !== "string") return null;
  const m = /^([A-Za-z0-9._-]{1,100})\/([A-Za-z0-9._-]{1,100})#(\d{1,9})$/.exec(ref.trim());
  return m ? `https://github.com/${m[1]}/${m[2]}/pull/${m[3]}` : null;
}

/** Espelho de LABEL_STATUS em src/i18n.ts. O teste cobra a igualdade. */
export const LABEL_STATUS = {
  reportado: "Reportado",
  backlog: "Backlog",
  em_progresso: "Em progresso",
  resolvido: "Resolvido",
  nao_sera_feito: "Não será feito",
  arquivado: "Arquivado",
};

/** Status a card does not come back from, so following it can stop here. */
const STATUS_FINAIS = new Set(["resolvido", "nao_sera_feito"]);

export function statusFinal(status) {
  return STATUS_FINAIS.has(status);
}

/**
 * The follow-up line for a card's thread, or null when nothing worth a message
 * changed. Text in Portuguese: a thread in the reports channel is read by the
 * community, same as the embed.
 *
 * Returns at most one line per change, and says what changed rather than
 * restating the card — whoever opens the thread already has the report above.
 */
export function mensagemDeMudanca(antes, depois) {
  const partes = [];

  const prNovo = depois.pr && depois.pr !== antes.pr ? urlDoPr(depois.pr) : null;
  if (prNovo) partes.push(`🔧 Pull request: ${prNovo}`);

  if (depois.status && depois.status !== antes.status) {
    const rotulo = LABEL_STATUS[depois.status] ?? depois.status;
    const marca = { resolvido: "✅", nao_sera_feito: "🚫", em_progresso: "🛠️", backlog: "📋" };
    partes.push(`${marca[depois.status] ?? "•"} ${rotulo}`);
  }

  if (partes.length === 0) return null;
  return {
    // Same reasoning as the embed: this carries a card's `pr` field, and the
    // thread is as public as the channel.
    allowed_mentions: { parse: [] },
    content: partes.join("\n"),
  };
}

/**
 * Saturation, measured as a rate over a window instead of "the page came back
 * full". A spam burst puts many cards inside a few minutes; a two-week backlog
 * does not, however long it is. That difference is the whole point — the old
 * test could not tell them apart and therefore blocked the drain it was meant
 * to allow.
 */
export function saturado(cards, { agora = Date.now(), janelaMs = SATURACAO_JANELA_MS, maximo = SATURACAO_MAX } = {}) {
  const inicio = agora - janelaMs;
  const dentro = cards.filter((c) => {
    const t = c.criadoEm ? Date.parse(c.criadoEm) : NaN;
    return Number.isFinite(t) && t >= inicio;
  });
  return dentro.length >= maximo;
}

// --- HTTP ------------------------------------------------------------------

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

class ErroFatal extends Error {}

/**
 * Consulta ordenada por `criadoEm DESC` com `arquivado == false` e `limit`:
 * é exatamente o índice que o quadro já usa (arquivado ASC, criadoEm DESC), e
 * é também a única forma que as regras aceitam de um anônimo.
 */
async function consultar({ desde, limite }) {
  const filtros = [
    { fieldFilter: { field: { fieldPath: "arquivado" }, op: "EQUAL", value: { booleanValue: false } } },
  ];
  if (desde) {
    // GREATER_THAN_OR_EQUAL, não GREATER_THAN: com `>` um empate no instante do
    // marco sumiria para sempre. Com `>=` o card da borda volta todo tique e é
    // descartado pela lista de ids já anunciados.
    filtros.push({
      fieldFilter: {
        field: { fieldPath: "criadoEm" },
        op: "GREATER_THAN_OR_EQUAL",
        value: { timestampValue: desde },
      },
    });
  }

  const structuredQuery = {
    from: [{ collectionId: "issues" }],
    where:
      filtros.length > 1 ? { compositeFilter: { op: "AND", filters: filtros } } : filtros[0],
    orderBy: [{ field: { fieldPath: "criadoEm" }, direction: "DESCENDING" }],
    limit: limite,
  };

  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/(default)/documents:runQuery?key=${API_KEY}`;

  const res = await comRetry("firestore", () =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery }),
      signal: AbortSignal.timeout(10_000),
    }),
  );

  const corpo = await res.json();
  if (!res.ok) {
    const msg = Array.isArray(corpo) ? corpo[0]?.error?.message : corpo?.error?.message;
    throw new ErroFatal(`Firestore ${res.status}: ${msg ?? JSON.stringify(corpo).slice(0, 200)}`);
  }
  if (!Array.isArray(corpo)) throw new ErroFatal("Firestore devolveu algo que não é lista");
  // Entradas sem `document` são só marcação de readTime — a resposta vazia é uma
  // lista com um item desses, não uma lista vazia.
  return corpo.filter((e) => e && e.document).map((e) => documentoParaCard(e.document));
}

/** Returns the created message (its `id` is what a thread hangs off), or null. */
async function postarDiscord(payload) {
  const res = await comRetry("discord", () =>
    fetch(`https://discord.com/api/v10/channels/${CANAL}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    }),
  );
  if (res.ok) return await res.json().catch(() => ({}));

  const texto = await res.text();
  // 400 é embed recusado: não adianta repetir, e não pode entupir a fila para
  // sempre. Marca como anunciado e segue — o próximo card não paga por este.
  if (res.status === 400) {
    console.error(`descartado (Discord 400): ${texto.slice(0, 300)}`);
    console.error(`payload: ${JSON.stringify(payload).slice(0, 600)}`);
    return null;
  }
  // 401/403 é configuração errada (token, permissão no canal). Parar sem mexer
  // no estado: o deadman avisa.
  throw new ErroFatal(`Discord ${res.status}: ${texto.slice(0, 300)}`);
}

/**
 * Hangs a thread off an announcement. A failure here is **not** fatal: the
 * report is already in the channel, which is the job. Losing the thread costs
 * the follow-up, and that is not worth throwing away a successful announcement
 * or stalling the queue behind it. Needs Create Public Threads on the channel.
 */
async function criarTopico(mensagemId, nome) {
  const res = await comRetry("discord-topico", () =>
    fetch(`https://discord.com/api/v10/channels/${CANAL}/messages/${mensagemId}/threads`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: nome, auto_archive_duration: TOPICO_ARQUIVA_MIN }),
      signal: AbortSignal.timeout(10_000),
    }),
  ).catch((err) => ({ ok: false, status: 0, text: async () => err.message }));

  if (!res.ok) {
    console.error(`sem tópico para a mensagem ${mensagemId}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return await res.json().catch(() => null);
}

/** Posts a follow-up into a card's thread. Also non-fatal, for the same reason. */
async function postarNoTopico(topicoId, payload) {
  const res = await comRetry("discord-topico", () =>
    fetch(`https://discord.com/api/v10/channels/${topicoId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    }),
  ).catch((err) => ({ ok: false, status: 0, text: async () => err.message }));

  if (!res.ok) {
    console.error(`tópico ${topicoId} recusou: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return false;
  }
  return true;
}

/**
 * One card by id, with the same anonymous identity as the list query — a
 * followed card is read one document at a time precisely so this stays cheap
 * enough to run every few minutes. A 404 means it was deleted; `null` then
 * takes it out of the follow-up list.
 */
async function lerCard(id) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/(default)/documents/issues/${encodeURIComponent(id)}?key=${API_KEY}`;
  const res = await comRetry("firestore-card", () =>
    fetch(url, { signal: AbortSignal.timeout(10_000) }),
  ).catch(() => null);
  if (!res || !res.ok) return null;
  const doc = await res.json().catch(() => null);
  return doc && doc.name ? documentoParaCard(doc) : null;
}

/**
 * The deadman's second path, and the reason it exists: the first path is the
 * Discord channel, which is one of the things that can break. It broke on
 * 2026-10-20 — the bot lost Send Messages — and the alert about it went to that
 * same channel 8755 times, swallowed by the catch below, so nobody heard for 13
 * days. A watchdog that reports through the thing it watches is not a watchdog.
 */
async function avisaCelular(mensagem) {
  if (!NTFY_TOPICO) return false;
  try {
    const r = await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: NTFY_TOPICO,
        title: "Anunciador de issues",
        message: mensagem.slice(0, 500),
        tags: ["warning"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** 429 respeitando o retry_after do corpo; 5xx com backoff e jitter. */
async function comRetry(nome, fazer) {
  let espera = 1000;
  for (let tentativa = 1; ; tentativa++) {
    let res;
    try {
      res = await fazer();
    } catch (err) {
      if (tentativa >= 3) throw new ErroFatal(`${nome}: ${err.message}`);
      await dorme(espera + Math.random() * 250);
      espera *= 2;
      continue;
    }

    if (res.status === 429) {
      const corpo = await res.clone().json().catch(() => ({}));
      if (corpo.global) throw new ErroFatal(`${nome}: rate limit global`);
      if (tentativa >= 3) throw new ErroFatal(`${nome}: 429 depois de 3 tentativas`);
      await dorme((Number(corpo.retry_after) || 1) * 1000 + 250);
      continue;
    }
    if (res.status >= 500 && tentativa < 3) {
      await dorme(espera + Math.random() * 250);
      espera *= 2;
      continue;
    }
    return res;
  }
}

// --- Estado ----------------------------------------------------------------

function lerEstado(caminho) {
  if (!existsSync(caminho)) return null;
  try {
    const e = JSON.parse(readFileSync(caminho, "utf8"));
    if (!e || e.versao !== 1 || typeof e.watermark !== "string") throw new Error("formato");
    e.anunciados = Array.isArray(e.anunciados) ? e.anunciados : [];
    e.falhasSeguidas = Number(e.falhasSeguidas) || 0;
    e.alertaEnviado = Boolean(e.alertaEnviado);
    // Added after the file was already in production, so it is read as optional
    // rather than demanded: an older state file stays valid and simply starts
    // following nothing.
    e.acompanhados = e.acompanhados && typeof e.acompanhados === "object" ? e.acompanhados : {};
    e.ultimaChecagem = Number(e.ultimaChecagem) || 0;
    return e;
  } catch (err) {
    // Refazer o bootstrap perde os anúncios da janela; recusar rodar deixaria o
    // serviço morto até alguém reparar, e ninguém está olhando. Perder dois
    // avisos é melhor que ficar mudo por uma semana.
    const morto = `${caminho}.corrompido-${Date.now()}`;
    renameSync(caminho, morto);
    console.error(`estado ilegível (${err.message}); movido para ${morto}, refazendo bootstrap`);
    return null;
  }
}

function gravarEstado(caminho, estado) {
  const tmp = `${caminho}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, `${JSON.stringify(estado, null, 2)}\n`);
    fsyncSync(fd); // sem isto o rename pode chegar ao disco antes dos dados
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, caminho); // atômico dentro do mesmo filesystem
}

// --- Execução --------------------------------------------------------------

function lerArgs(argv) {
  const pega = (nome, padrao) => (argv.includes(nome) ? argv[argv.indexOf(nome) + 1] : padrao);
  return {
    dryRun: argv.includes("--dry-run"),
    bootstrap: argv.includes("--bootstrap"),
    verbose: argv.includes("--verbose"),
    desde: pega("--desde", null),
    estado: pega("--estado", ESTADO_PADRAO),
    max: Number(pega("--max", 10)),
    limite: Number(pega("--limite", 25)),
  };
}

/**
 * Keeps the follow-up list bounded, dropping the oldest entries — insertion
 * order is announcement order. A card normally leaves this list by reaching a
 * final status; the cap is only there so a card that never does cannot grow
 * `estado.json` forever.
 */
export function podar(acompanhados, maximo = ACOMPANHADOS_MAX) {
  const chaves = Object.keys(acompanhados ?? {});
  if (chaves.length <= maximo) return acompanhados ?? {};
  return Object.fromEntries(chaves.slice(-maximo).map((k) => [k, acompanhados[k]]));
}

/**
 * Posts into each followed card's thread what changed on it since the last
 * check: the pull request when it appears, the status when it moves. This is
 * the half that makes a thread worth having — the report stops being a message
 * that scrolled away and becomes somewhere to look for what happened to it.
 *
 * Nothing in here is fatal. A card is followed because it was announced
 * successfully, and failing to narrate it later must not turn a working
 * announcer into a red unit.
 */
async function acompanharMudancas(estado, opcoes) {
  const ids = Object.keys(estado.acompanhados);
  if (ids.length === 0) return;

  const agora = Date.now();
  if (agora - estado.ultimaChecagem < CHECAGEM_INTERVALO_MS) return;
  estado.ultimaChecagem = agora;

  for (const id of ids) {
    const seguido = estado.acompanhados[id];
    const atual = await lerCard(id);
    if (!atual) {
      // Deleted, or archived out of the anonymous query's reach. Either way
      // there is nothing left to narrate.
      delete estado.acompanhados[id];
      continue;
    }

    const msg = mensagemDeMudanca(seguido, atual);
    if (msg) {
      if (opcoes.verbose) console.log(`tópico de ${id}: ${msg.content.replace(/\n/g, " | ")}`);
      const ok = await postarNoTopico(seguido.topico, msg);
      // Only record what was actually told, so a failed post is retried on the
      // next check instead of being silently skipped.
      if (!ok) continue;
      console.log(`acompanhado ${id}`);
      await dorme(1200);
    }

    seguido.pr = atual.pr ?? null;
    seguido.status = atual.status ?? null;
    if (statusFinal(atual.status)) delete estado.acompanhados[id];
  }

  // Always: the check itself moved `ultimaChecagem`, and losing that would make
  // the next run check again immediately.
  gravarEstado(opcoes.estado, estado);
}

async function main(argv) {
  const opcoes = lerArgs(argv);
  if (!opcoes.dryRun && !TOKEN) throw new ErroFatal("DISCORD_BOT_TOKEN não definido");

  let estado = opcoes.dryRun && opcoes.desde ? null : lerEstado(opcoes.estado);

  // Bootstrap: marca onde estamos e não anuncia nada. É o que impede os 62 cards
  // antigos de caírem de uma vez no canal na primeira execução.
  if ((!estado || opcoes.bootstrap) && !opcoes.desde) {
    const docs = await consultar({ desde: null, limite: 5 });
    const novo = {
      versao: 1,
      watermark: docs[0]?.criadoEm ?? new Date().toISOString(),
      anunciados: docs.map((d) => d.id),
      falhasSeguidas: 0,
      alertaEnviado: false,
      acompanhados: {},
      ultimaChecagem: 0,
    };
    if (opcoes.dryRun) {
      console.log(`[dry-run] bootstrap gravaria marco em ${novo.watermark}`);
      return;
    }
    gravarEstado(opcoes.estado, novo);
    console.log(`bootstrap: marco d'água em ${novo.watermark}, 0 anúncios`);
    return;
  }

  const manual = Boolean(opcoes.desde);
  const desde = opcoes.desde ?? estado.watermark;
  // `--desde` sem arquivo de estado é resgate manual: começa um estado do zero
  // em vez de estourar em null lá no laço.
  if (!estado) {
    estado = {
      versao: 1,
      watermark: desde,
      anunciados: [],
      falhasSeguidas: 0,
      alertaEnviado: false,
      acompanhados: {},
      ultimaChecagem: 0,
    };
  }
  const docs = await consultar({ desde, limite: opcoes.limite });
  if (opcoes.verbose) console.log(`${docs.length} card(s) na consulta desde ${desde}`);

  // Many cards at once still wants a human — but only when they arrived at
  // once. A backlog is drained `--max` at a time instead of blocking, because
  // blocking on it could never clear itself: the watermark moves only when
  // something is posted.
  if (!manual && saturado(docs)) {
    throw new ErroFatal(
      `fluxo saturado: ${SATURACAO_MAX}+ cards em ${SATURACAO_JANELA_MS / 60000} min — verifique spam e destrave com --desde`,
    );
  }

  const jaAnunciados = new Set(estado?.anunciados ?? []);
  const novos = docs.filter((d) => !jaAnunciados.has(d.id)).reverse(); // do mais antigo
  if (!manual && novos.length > opcoes.max) {
    // Visible on purpose: a drain in progress is not the happy path, and the
    // journal should say so until it finishes.
    console.log(`${novos.length} card(s) atrasados; anunciando ${opcoes.max} neste tique`);
  }

  for (const card of novos.slice(0, opcoes.max)) {
    const payload = montarMensagem(card);

    if (opcoes.dryRun) {
      console.log(JSON.stringify(payload, null, 2));
      continue;
    }

    const postado = await postarDiscord(payload);
    // Grava DEPOIS de cada post, não no fim do lote: uma queda aqui repete uma
    // mensagem (visível, e some com um clique), enquanto gravar antes perderia o
    // anúncio em silêncio e ninguém nota o report que nunca saiu.
    estado.anunciados.push(card.id);
    if (estado.anunciados.length > IDS_GUARDADOS) {
      estado.anunciados = estado.anunciados.slice(-IDS_GUARDADOS);
    }
    if (card.criadoEm && chaveOrdem(card.criadoEm) > chaveOrdem(estado.watermark)) {
      estado.watermark = card.criadoEm;
    }
    estado.falhasSeguidas = 0;
    estado.alertaEnviado = false;

    // The thread comes after the announcement is already saved as announced:
    // if this fails, the card does not get announced twice to get a thread.
    if (postado?.id && !statusFinal(card.status)) {
      const topico = await criarTopico(postado.id, nomeDoTopico(card));
      if (topico?.id) {
        estado.acompanhados[card.id] = {
          topico: topico.id,
          mensagem: postado.id,
          pr: card.pr ?? null,
          status: card.status ?? null,
        };
      }
    }
    estado.acompanhados = podar(estado.acompanhados);

    gravarEstado(opcoes.estado, estado);
    if (postado) console.log(`anunciado ${card.id}`);
    await dorme(1200); // o balde por canal é ~5 msg / 5 s
  }

  if (opcoes.dryRun) return;

  await acompanharMudancas(estado, opcoes);

  // Silêncio no caminho feliz: o systemd já loga Starting/Finished a cada
  // disparo, e 720 execuções por dia de "nada novo" só enchem o journal.
  if (estado.falhasSeguidas !== 0 || estado.alertaEnviado) {
    estado.falhasSeguidas = 0;
    estado.alertaEnviado = false;
    gravarEstado(opcoes.estado, estado);
  }
}

/**
 * Falha silenciosa é o risco real aqui: regra apertada, chave trocada ou token
 * revogado derrubam o serviço e o único sinal é um one-shot vermelho a cada dois
 * minutos que ninguém lê. Depois de ~20 min de falha seguida, avisa uma vez só e
 * cala até voltar a funcionar.
 *
 * It warns down **two** paths, and that is the whole lesson of 2026-10-20: the
 * bot lost Send Messages on the channel, so the service died and the alert about
 * it was posted to that same channel, where it was refused 8755 times in a row
 * and swallowed. Thirteen days of silence. The ntfy topic does not depend on
 * Discord being healthy, which is exactly what an alert about Discord needs.
 * Either path succeeding is enough to go quiet — otherwise a dead channel keeps
 * the alarm un-sent forever, which is the bug being fixed here.
 */
async function deadman(caminho, erro) {
  const estado = lerEstado(caminho);
  if (!estado) return;
  estado.falhasSeguidas += 1;
  if (estado.falhasSeguidas >= FALHAS_PARA_ALERTA && !estado.alertaEnviado) {
    const minutos = estado.falhasSeguidas * 2;
    const texto = `o anunciador de issues está falhando há ~${minutos} min: ${String(erro.message).slice(0, 300)}`;

    const noCelular = await avisaCelular(texto);
    let noCanal = false;
    if (TOKEN) {
      try {
        await postarDiscord({ allowed_mentions: { parse: [] }, content: `⚠️ ${texto}` });
        noCanal = true;
      } catch {
        // Expected when Discord is the thing that broke. That is why the phone
        // was tried first instead of last.
      }
    }
    if (!noCelular && !noCanal) console.error("deadman não conseguiu avisar por nenhum caminho");
    estado.alertaEnviado = noCelular || noCanal;
  }
  gravarEstado(caminho, estado);
}

const executadoDireto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  const opcoes = lerArgs(process.argv.slice(2));
  main(process.argv.slice(2)).catch(async (err) => {
    console.error(err instanceof ErroFatal ? err.message : err);
    if (!opcoes.dryRun) await deadman(opcoes.estado, err).catch(() => undefined);
    process.exit(1);
  });
}
