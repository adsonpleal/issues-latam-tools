#!/usr/bin/env node
// Announces the public board's new cards on Discord.
//
//   node tools/announce-discord.mjs --dry-run --since 2020-01-01T00:00:00Z --max 100
//   node tools/announce-discord.mjs --bootstrap
//   node tools/announce-discord.mjs
//
// The Portuguese flag spellings (`--desde`, `--estado`, `--limite`) still work:
// they are in the README and in the deploy skill, and they are what gets typed
// on the server during a rescue.
//
// Runs as a systemd one-shot every 2 min (infra/issues-discord.timer). One-shot
// rather than a resident process on purpose: a hung fetch dies in
// TimeoutStartSec and the next tick starts clean, whereas a setInterval poller
// stays green in systemctl forever with the announcements stopped.
//
// Queries Firestore WITHOUT AUTHENTICATION, as an anonymous visitor. The rules
// allow listing `arquivado == false` with `limit <= 500` and deny
// `privado/contato` to anyone who is not admin -- which means this process
// CANNOT read a reporter's contact, not even by mistake. Privacy is guaranteed
// by Firestore, not by our discipline. That is why neither firebase-admin nor a
// service account comes in here: an admin credential overrides the rules and
// would throw that guarantee away.
//
// Intended side effect: recordings (`tipo: "replay"`) are born archived, and so
// never show up in this query.
//
// Each announcement gets a thread, and the card is then followed: when a pull
// request is recorded on it, or its status moves, that is posted into the
// thread. Both fields are public and only read, so none of this costs the
// anonymous identity above -- the point of which is that this process CANNOT
// read a reporter's contact even by mistake.

import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// --- Configuration ---------------------------------------------------------

const env = process.env;
const PROJECT_ID = env.FIREBASE_PROJECT_ID || "issues-latam-tools";
// Public web key: it already ships in the site's bundle (src/lib/firebase.ts).
// Not a secret -- access is decided by the rules, not by this.
const API_KEY = env.FIREBASE_API_KEY || "AIzaSyCcBw2edbq0x15csy4h4w_ZBZOGnpNvBro";
const CHANNEL_ID = env.DISCORD_CHANNEL_ID || "1538690478751354880";
const TOKEN = env.DISCORD_BOT_TOKEN || "";
const SITE_URL = env.SITE_URL || "https://issues.latam-tools.com.br";
// The env var keeps its Portuguese name: it is set by the deployed systemd unit
// (infra/issues-discord.service), so renaming it here would silently send the
// watermark back to the default path and re-announce the whole board.
const DEFAULT_STATE_PATH = env.ESTADO || "/var/lib/issues-discord/estado.json";
/**
 * The deadman's way out of Discord, and it has **no default in the code on
 * purpose**: this repository is public, and an ntfy topic is the password of
 * whoever publishes to it. Same reasoning as `ntfyTopic()` in
 * `tools/triage.mjs`. Comes from a root-only systemd drop-in, like the bot
 * token, and is never logged.
 *
 * The env var's name is the deployed unit's, so it stays as it is written there.
 */
const NTFY_TOPIC = env.NTFY_TOPICO || "";

/**
 * Mirror of src/lib/projetos.ts. The test fails if the two tables diverge.
 *
 * The slugs are stored `projeto` values on the cards, so they keep the
 * database's spelling; the field names match the app's table because the test
 * compares them field by field.
 */
export const PROJECTS = {
  mercado: { name: "Mercado", color: "#3fa96c" },
  simulador: { name: "Simulador", color: "#d1683f" },
  recap: { name: "Recap", color: "#7a5fd1" },
  visuais: { name: "Visuais", color: "#3f6cd1" },
  calc: { name: "Calculadoras", color: "#c9a227" },
};

/**
 * Mirror of TYPE_LABEL in src/i18n.ts. Likewise: the test demands equality.
 * The keys are stored `tipo` values; the labels are read by the community in
 * the channel, so they stay in Portuguese.
 */
export const TYPE_LABEL = { bug: "Bug", feature: "Sugestão", replay: "Gravação" };

const UNKNOWN_COLOR = 0x5865f2; // Discord blurple
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 500;
const LINES_MAX = 8;
const IDS_KEPT = 200;
const FAILURES_BEFORE_ALERT = 10;

/**
 * Saturation is a RATE, and these two say which rate. The guard used to fire on
 * "the query page came back full", which conflated a spam burst with a backlog --
 * and since the watermark only moves when something is posted, a backlog over
 * one page blocked every run forever and grew more certain to block the next.
 * That is how this service spent 12 days red. A window and a count cannot
 * deadlock: a backlog spread over days is not a burst in any window.
 */
const SATURATION_WINDOW_MS = 15 * 60 * 1000;
const SATURATION_MAX = 10;

/** Thread title cap in the Discord API. */
const THREAD_NAME_MAX = 100;
/** 7 days. Posting into an archived thread un-archives it, so this is cosmetic. */
const THREAD_ARCHIVE_MIN = 10080;
/**
 * How many announced cards keep a thread being followed. The cap is what stops
 * the state file growing without bound; a card leaves earlier than this the
 * moment it reaches a final status.
 */
const FOLLOWED_MAX = 60;
/**
 * Follow-ups are not checked on every run. Each check costs one Firestore read
 * per followed card and this service wakes 720 times a day -- reading
 * everything every tick is what exhausted the free quota once already. Ten
 * minutes is the delay for a pull request to show up in its thread, and the
 * interval is a clock rather than a tick counter so a quiet run still writes
 * nothing to disk.
 */
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

// --- Firestore's typed fields ----------------------------------------------

/**
 * REST returns every field wrapped in its type (`{"stringValue": "..."}`).
 * `integerValue` arrives as a STRING, and `timestampValue` NEVER becomes a Date
 * here: Firestore emits microseconds and Date truncates to milliseconds, which
 * would put the watermark before the card it came from and re-announce that
 * card forever.
 */
export function fieldValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fieldValue);
  if ("mapValue" in v) {
    return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fieldValue(x)]));
  }
  return null;
}

/**
 * The one place a stored document becomes a card for the rest of this file.
 *
 * The keys on the left of each `:` are Firestore's own field names and are a
 * contract with the live database and the deployed site; the names on the right
 * are ours. Renaming anything on the left is a data migration, not a cleanup.
 */
export function toCard(doc) {
  const f = doc.fields ?? {};
  return {
    id: doc.name.split("/").pop(),
    project: fieldValue(f.projeto),
    type: fieldValue(f.tipo),
    title: fieldValue(f.titulo) ?? "",
    description: fieldValue(f.descricao) ?? "",
    author: fieldValue(f.autor) ?? null,
    createdAt: fieldValue(f.criadoEm) ?? null,
    // Both public fields, and both only read: the follow-up in a card's thread
    // is built from these two. Nothing here reaches `privado/contato`, which
    // the rules deny this anonymous identity anyway.
    status: fieldValue(f.status) ?? null,
    pr: fieldValue(f.pr) ?? null,
  };
}

/**
 * Comparing RFC3339 timestamps as raw strings does not work: "…34Z" sorts after
 * "…34.5Z" lexicographically, because 'Z' > '.'. This normalises the fraction
 * to nine places before comparing. For ordering only -- what gets stored and
 * sent back is always the original string.
 */
export function orderKey(ts) {
  if (typeof ts !== "string") return "";
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/.exec(ts);
  if (!m) return ts;
  return `${m[1]}.${(m[2] ?? "").padEnd(9, "0")}`;
}

// --- Sanitising the user's text --------------------------------------------

// `titulo` and `descricao` are ANONYMOUS public writing being relayed into a
// channel under the identity of a bot the community trusts. Treat every
// character as hostile.

/** Invisibles: control (except \n), zero-width, bidi direction marks. */
const INVISIBLE = /[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uE000]/g;
// Does not swallow trailing punctuation: with `\S+` a link in parentheses took
// the `)` with it and left the sentence with a parenthesis open forever.
const URLS =
  /\b(?:https?:\/\/|www\.|discord\.gg\/|discord(?:app)?\.com\/invite\/)(?:[^\s<>]*[^\s<>.,;:!?)\]}])?/gi;
const SENTINEL = "\uE000"; // marks a removed URL so it survives escaping intact

/**
 * Escapes only what forms markup: bold, italic, strikethrough, spoiler, code,
 * masked link and mention. `:` `(` `)` `.` are deliberately left out --
 * escaping everything would fill ordinary Portuguese text with visible
 * backslashes, and without `[` `]` there is no way to build `[text](bad-link)`
 * anyway.
 */
function escapeMarkdown(text) {
  return text.replace(/([\\*_~`|[\]<>])/g, "\\$1").replace(/^#/gm, "\\#");
}

export function sanitizeDescription(text) {
  if (typeof text !== "string") return "";
  let s = text.replace(/\t/g, " ").replace(INVISIBLE, "");
  // An embed description turns a bare URL into a clickable link -- so no URL of
  // the user's leaves here. Anyone who wants to see it clicks the card's
  // permalink, where TextoComLinks.tsx already handles them under the site's
  // own rules.
  s = s.replace(URLS, SENTINEL);
  s = escapeMarkdown(s);
  s = s.split(SENTINEL).join("[link]");
  s = s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  const lines = s.split("\n");
  if (lines.length > LINES_MAX) s = lines.slice(0, LINES_MAX).join("\n");
  return s.trim();
}

/** An embed title does not render markdown, so escaping would only litter it. */
export function sanitizeTitle(text) {
  if (typeof text !== "string") return "";
  return text.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/**
 * Cuts by code point (`[...s]`), not by `slice`: cutting inside a surrogate
 * pair splits the emoji in half and renders as an error glyph. Backs up to the
 * last space when there is one near the end, so it does not stop mid-word.
 */
export function truncate(text, max) {
  const chars = [...text];
  if (chars.length <= max) return text;
  const cut = chars.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // The `>= 0` is not decoration: without it a text with no space at all falls
  // into `slice(0, -1)` and loses its last character.
  const withinWindow = lastSpace >= 0 && lastSpace > max - 60;
  const end = withinWindow ? lastSpace : cut.length;
  return `${cut.slice(0, end).join("").trimEnd()}…`;
}

// --- The message -----------------------------------------------------------

export function buildMessage(card) {
  const project = PROJECTS[card.project];
  const typeLabel = TYPE_LABEL[card.type] ?? card.type ?? "?";
  const color = project ? parseInt(project.color.slice(1), 16) : UNKNOWN_COLOR;
  const author = typeof card.author === "string" ? sanitizeTitle(card.author) : "";
  const description = truncate(sanitizeDescription(card.description), DESCRIPTION_MAX);

  const embed = {
    author: { name: truncate(`${project ? project.name : card.project} · ${typeLabel}`, 256) },
    // Read in the channel by the community, so the fallback is Portuguese.
    title: truncate(sanitizeTitle(card.title), TITLE_MAX) || "(sem título)",
    url: `${SITE_URL}/t/${encodeURIComponent(card.id)}`,
    color,
    // A footer renders neither markdown nor mentions: it is the safest place
    // for the nickname, which is the user's text.
    footer: { text: truncate(author ? `Reportado por ${author} · ${host()}` : host(), 2048) },
  };
  if (description) embed.description = description;
  if (card.createdAt) embed.timestamp = card.createdAt;

  return {
    // Without this an `@everyone` in a title would ring the whole server. None
    // of the five sibling scripts does that; here the text is anonymous, so it
    // is mandatory.
    allowed_mentions: { parse: [] },
    // Lets Discord itself drop the repeat when the state write falls between
    // the 2xx and the fsync. A short, undocumented window -- it is a backstop,
    // not the guarantee; the guarantee is the `announced` list.
    nonce: createHash("sha1").update(card.id).digest("hex").slice(0, 25),
    enforce_nonce: true,
    embeds: [embed],
  };
}

function host() {
  return SITE_URL.replace(/^https?:\/\//, "");
}

// --- A card's thread -------------------------------------------------------

/**
 * A thread hangs off the announcement so the conversation about a report, and
 * the pull request that closes it, stay with the report instead of scrolling
 * away in the channel. The name is the card's title and nothing else: Discord
 * shows it in the thread list, where a prefix would only eat the 100 chars.
 */
export function threadName(card) {
  // `truncate` adds an ellipsis, so it returns max + 1 code points. The embed
  // title can absorb that; a thread name cannot -- 100 is a hard cap in the API
  // and 101 comes back 400. Hence the -1.
  return truncate(sanitizeTitle(card.title), THREAD_NAME_MAX - 1) || "(sem título)";
}

/**
 * `owner/repo#N` is how `tools/triage.mjs` writes the `pr` field. Validate it
 * instead of trusting it: this builds a link that gets posted under the bot's
 * identity, and a field is a field -- anything that does not match exactly is
 * dropped rather than linked.
 */
export function pullRequestUrl(ref) {
  if (typeof ref !== "string") return null;
  const m = /^([A-Za-z0-9._-]{1,100})\/([A-Za-z0-9._-]{1,100})#(\d{1,9})$/.exec(ref.trim());
  return m ? `https://github.com/${m[1]}/${m[2]}/pull/${m[3]}` : null;
}

/**
 * Mirror of STATUS_LABEL in src/i18n.ts. The test demands equality. The keys
 * are the stored status values; the labels are read in the channel.
 */
export const STATUS_LABEL = {
  reportado: "Reportado",
  backlog: "Backlog",
  em_progresso: "Em progresso",
  resolvido: "Resolvido",
  nao_sera_feito: "Não será feito",
  arquivado: "Arquivado",
};

/** Status a card does not come back from, so following it can stop here. */
const FINAL_STATUSES = new Set(["resolvido", "nao_sera_feito"]);

export function isFinalStatus(status) {
  return FINAL_STATUSES.has(status);
}

/**
 * The follow-up line for a card's thread, or null when nothing worth a message
 * changed. Text in Portuguese: a thread in the reports channel is read by the
 * community, same as the embed.
 *
 * Returns at most one line per change, and says what changed rather than
 * restating the card -- whoever opens the thread already has the report above.
 */
export function changeMessage(before, after) {
  const parts = [];

  const newPr = after.pr && after.pr !== before.pr ? pullRequestUrl(after.pr) : null;
  if (newPr) parts.push(`🔧 Pull request: ${newPr}`);

  if (after.status && after.status !== before.status) {
    const label = STATUS_LABEL[after.status] ?? after.status;
    const icon = { resolvido: "✅", nao_sera_feito: "🚫", em_progresso: "🛠️", backlog: "📋" };
    parts.push(`${icon[after.status] ?? "•"} ${label}`);
  }

  if (parts.length === 0) return null;
  return {
    // Same reasoning as the embed: this carries a card's `pr` field, and the
    // thread is as public as the channel.
    allowed_mentions: { parse: [] },
    content: parts.join("\n"),
  };
}

/**
 * Saturation, measured as a rate over a window instead of "the page came back
 * full". A spam burst puts many cards inside a few minutes; a two-week backlog
 * does not, however long it is. That difference is the whole point -- the old
 * test could not tell them apart and therefore blocked the drain it was meant
 * to allow.
 */
export function isSaturated(
  cards,
  { now = Date.now(), windowMs = SATURATION_WINDOW_MS, max = SATURATION_MAX } = {},
) {
  const start = now - windowMs;
  const inside = cards.filter((c) => {
    const t = c.createdAt ? Date.parse(c.createdAt) : NaN;
    return Number.isFinite(t) && t >= start;
  });
  return inside.length >= max;
}

// --- HTTP ------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class FatalError extends Error {}

/**
 * A query ordered by `criadoEm DESC` with `arquivado == false` and a `limit`:
 * exactly the index the board already uses (arquivado ASC, criadoEm DESC), and
 * also the only shape the rules accept from an anonymous caller.
 */
async function queryCards({ since, limit }) {
  const filters = [
    { fieldFilter: { field: { fieldPath: "arquivado" }, op: "EQUAL", value: { booleanValue: false } } },
  ];
  if (since) {
    // GREATER_THAN_OR_EQUAL, not GREATER_THAN: with `>` a card tied with the
    // watermark's instant would vanish forever. With `>=` the card on the edge
    // comes back every tick and is dropped by the already-announced id list.
    filters.push({
      fieldFilter: {
        field: { fieldPath: "criadoEm" },
        op: "GREATER_THAN_OR_EQUAL",
        value: { timestampValue: since },
      },
    });
  }

  const structuredQuery = {
    from: [{ collectionId: "issues" }],
    where:
      filters.length > 1 ? { compositeFilter: { op: "AND", filters } } : filters[0],
    orderBy: [{ field: { fieldPath: "criadoEm" }, direction: "DESCENDING" }],
    limit,
  };

  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/(default)/documents:runQuery?key=${API_KEY}`;

  const res = await withRetry("firestore", () =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery }),
      signal: AbortSignal.timeout(10_000),
    }),
  );

  const body = await res.json();
  if (!res.ok) {
    const msg = Array.isArray(body) ? body[0]?.error?.message : body?.error?.message;
    throw new FatalError(`Firestore ${res.status}: ${msg ?? JSON.stringify(body).slice(0, 200)}`);
  }
  if (!Array.isArray(body)) throw new FatalError("Firestore returned something that is not a list");
  // Entries without `document` are just readTime markers -- an empty response
  // is a list holding one of those, not an empty list.
  return body.filter((e) => e && e.document).map((e) => toCard(e.document));
}

/** Returns the created message (its `id` is what a thread hangs off), or null. */
async function postToChannel(payload) {
  const res = await withRetry("discord", () =>
    fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    }),
  );
  if (res.ok) return await res.json().catch(() => ({}));

  const text = await res.text();
  // A 400 is a refused embed: repeating will not help, and it must not clog the
  // queue forever. Mark it announced and move on -- the next card does not pay
  // for this one.
  if (res.status === 400) {
    console.error(`dropped (Discord 400): ${text.slice(0, 300)}`);
    console.error(`payload: ${JSON.stringify(payload).slice(0, 600)}`);
    return null;
  }
  // 401/403 is misconfiguration (token, channel permission). Stop without
  // touching the state: the deadman reports it.
  throw new FatalError(`Discord ${res.status}: ${text.slice(0, 300)}`);
}

/**
 * Hangs a thread off an announcement. A failure here is **not** fatal: the
 * report is already in the channel, which is the job. Losing the thread costs
 * the follow-up, and that is not worth throwing away a successful announcement
 * or stalling the queue behind it. Needs Create Public Threads on the channel.
 */
async function createThread(messageId, name) {
  const res = await withRetry("discord-thread", () =>
    fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages/${messageId}/threads`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, auto_archive_duration: THREAD_ARCHIVE_MIN }),
      signal: AbortSignal.timeout(10_000),
    }),
  ).catch((err) => ({ ok: false, status: 0, text: async () => err.message }));

  if (!res.ok) {
    console.error(`no thread for message ${messageId}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return await res.json().catch(() => null);
}

/** Posts a follow-up into a card's thread. Also non-fatal, for the same reason. */
async function postToThread(threadId, payload) {
  const res = await withRetry("discord-thread", () =>
    fetch(`https://discord.com/api/v10/channels/${threadId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    }),
  ).catch((err) => ({ ok: false, status: 0, text: async () => err.message }));

  if (!res.ok) {
    console.error(`thread ${threadId} refused: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return false;
  }
  return true;
}

/**
 * One card by id, with the same anonymous identity as the list query -- a
 * followed card is read one document at a time precisely so this stays cheap
 * enough to run every few minutes. A 404 means it was deleted; `null` then
 * takes it out of the follow-up list.
 */
async function readCard(id) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/(default)/documents/issues/${encodeURIComponent(id)}?key=${API_KEY}`;
  const res = await withRetry("firestore-card", () =>
    fetch(url, { signal: AbortSignal.timeout(10_000) }),
  ).catch(() => null);
  if (!res || !res.ok) return null;
  const doc = await res.json().catch(() => null);
  return doc && doc.name ? toCard(doc) : null;
}

/**
 * The deadman's second path, and the reason it exists: the first path is the
 * Discord channel, which is one of the things that can break. It broke on
 * 2026-10-20 -- the bot lost Send Messages -- and the alert about it went to
 * that same channel 8755 times, swallowed by the catch below, so nobody heard
 * for 13 days. A watchdog that reports through the thing it watches is not a
 * watchdog.
 *
 * The message is Portuguese: it lands on Adson's phone.
 */
async function alertPhone(message) {
  if (!NTFY_TOPIC) return false;
  try {
    const r = await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: NTFY_TOPIC,
        title: "Anunciador de issues",
        message: message.slice(0, 500),
        tags: ["warning"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * One push per newly reported card. This exists because reviewing `reportado`
 * is now a step only Adson can take: the triage queue reads `backlog`, and a
 * card moves no further until he has read it and moved it himself. A Discord
 * message is easy to miss, and a missed one stalls the whole pipeline.
 *
 * Deliberately NOT the priority or tags `alertPhone` uses. An outage alarm and
 * "somebody filed a bug" must not feel the same on the phone, or the alarm
 * stops meaning anything -- which is the failure this whole file is shaped
 * around.
 *
 * This is a notification an unauthenticated stranger triggers by filling in a
 * form, so it inherits the same rate limit as the Discord posts: `--max` cards
 * per tick, draining a burst at the tick's pace instead of ringing the phone
 * two hundred times. The title is the reporter's own text, sanitised the same
 * way the embed sanitises it.
 */
async function pushNewCard(card) {
  if (!NTFY_TOPIC) return false;
  const project = PROJECTS[card.project];
  try {
    const r = await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: NTFY_TOPIC,
        title: `Novo card - ${project ? project.name : card.project}`,
        message: truncate(sanitizeTitle(card.title), 200) || "(sem titulo)",
        click: `${SITE_URL}/t/${encodeURIComponent(card.id)}`,
        tags: ["inbox_tray"],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** 429 honouring the body's retry_after; 5xx with backoff and jitter. */
async function withRetry(name, attempt) {
  let wait = 1000;
  for (let attemptNo = 1; ; attemptNo++) {
    let res;
    try {
      res = await attempt();
    } catch (err) {
      if (attemptNo >= 3) throw new FatalError(`${name}: ${err.message}`);
      await sleep(wait + Math.random() * 250);
      wait *= 2;
      continue;
    }

    if (res.status === 429) {
      const body = await res.clone().json().catch(() => ({}));
      if (body.global) throw new FatalError(`${name}: global rate limit`);
      if (attemptNo >= 3) throw new FatalError(`${name}: 429 after 3 attempts`);
      await sleep((Number(body.retry_after) || 1) * 1000 + 250);
      continue;
    }
    if (res.status >= 500 && attemptNo < 3) {
      await sleep(wait + Math.random() * 250);
      wait *= 2;
      continue;
    }
    return res;
  }
}

// --- State -----------------------------------------------------------------

/**
 * The state file on the server is persisted data, written by the version of
 * this script that is deployed now. Its keys are therefore a contract, exactly
 * like Firestore's field names: `readState` below demands `versao === 1` and a
 * string `watermark`, and anything it does not recognise gets the file renamed
 * `.corrompido-*` and the bootstrap redone -- which silently drops the
 * announcements in that window.
 *
 * So the two functions here are the only place those spellings appear. In
 * memory the state is English; on disk it is what `/var/lib/issues-discord`
 * already holds.
 */
export function stateFromDisk(e) {
  return {
    version: e.versao,
    watermark: e.watermark,
    announced: Array.isArray(e.anunciados) ? e.anunciados : [],
    consecutiveFailures: Number(e.falhasSeguidas) || 0,
    alertSent: Boolean(e.alertaEnviado),
    // Added after the file was already in production, so it is read as optional
    // rather than demanded: an older state file stays valid and simply starts
    // following nothing.
    followed: Object.fromEntries(
      Object.entries(e.acompanhados && typeof e.acompanhados === "object" ? e.acompanhados : {}).map(
        ([id, f]) => [id, { threadId: f.topico, messageId: f.mensagem, pr: f.pr ?? null, status: f.status ?? null }],
      ),
    ),
    lastCheck: Number(e.ultimaChecagem) || 0,
  };
}

export function stateToDisk(s) {
  return {
    versao: s.version,
    watermark: s.watermark,
    anunciados: s.announced,
    falhasSeguidas: s.consecutiveFailures,
    alertaEnviado: s.alertSent,
    acompanhados: Object.fromEntries(
      Object.entries(s.followed).map(([id, f]) => [
        id,
        { topico: f.threadId, mensagem: f.messageId, pr: f.pr ?? null, status: f.status ?? null },
      ]),
    ),
    ultimaChecagem: s.lastCheck,
  };
}

/** A state for a server that has none yet, or for a manual `--since` rescue. */
export function freshState(watermark, announced = []) {
  return {
    version: 1,
    watermark,
    announced,
    consecutiveFailures: 0,
    alertSent: false,
    followed: {},
    lastCheck: 0,
  };
}

function readState(path) {
  if (!existsSync(path)) return null;
  try {
    const e = JSON.parse(readFileSync(path, "utf8"));
    if (!e || e.versao !== 1 || typeof e.watermark !== "string") throw new Error("shape");
    return stateFromDisk(e);
  } catch (err) {
    // Redoing the bootstrap loses the window's announcements; refusing to run
    // would leave the service dead until somebody fixed it, and nobody is
    // watching. Losing two announcements beats going mute for a week.
    const dead = `${path}.corrompido-${Date.now()}`;
    renameSync(path, dead);
    console.error(`state unreadable (${err.message}); moved to ${dead}, redoing bootstrap`);
    return null;
  }
}

function writeState(path, state) {
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeFileSync(fd, `${JSON.stringify(stateToDisk(state), null, 2)}\n`);
    fsyncSync(fd); // without this the rename can reach the disk before the data
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path); // atomic within the same filesystem
}

// --- Running ---------------------------------------------------------------

/**
 * The Portuguese flag spellings are kept as aliases: they are what the README
 * and the deploy skill tell you to type, and a rescue on the server is no place
 * to discover a flag was renamed.
 */
function parseArgs(argv) {
  const value = (fallback, ...names) => {
    for (const name of names) {
      const i = argv.indexOf(name);
      if (i >= 0) return argv[i + 1];
    }
    return fallback;
  };
  return {
    dryRun: argv.includes("--dry-run"),
    bootstrap: argv.includes("--bootstrap"),
    verbose: argv.includes("--verbose"),
    since: value(null, "--since", "--desde"),
    statePath: value(DEFAULT_STATE_PATH, "--state", "--estado"),
    max: Number(value(10, "--max")),
    limit: Number(value(25, "--limit", "--limite")),
  };
}

/**
 * Keeps the follow-up list bounded, dropping the oldest entries -- insertion
 * order is announcement order. A card normally leaves this list by reaching a
 * final status; the cap is only there so a card that never does cannot grow the
 * state file forever.
 */
export function prune(followed, max = FOLLOWED_MAX) {
  const keys = Object.keys(followed ?? {});
  if (keys.length <= max) return followed ?? {};
  return Object.fromEntries(keys.slice(-max).map((k) => [k, followed[k]]));
}

/**
 * Posts into each followed card's thread what changed on it since the last
 * check: the pull request when it appears, the status when it moves. This is
 * the half that makes a thread worth having -- the report stops being a message
 * that scrolled away and becomes somewhere to look for what happened to it.
 *
 * Nothing in here is fatal. A card is followed because it was announced
 * successfully, and failing to narrate it later must not turn a working
 * announcer into a red unit.
 */
async function followChanges(state, options) {
  const ids = Object.keys(state.followed);
  if (ids.length === 0) return;

  const now = Date.now();
  if (now - state.lastCheck < CHECK_INTERVAL_MS) return;
  state.lastCheck = now;

  for (const id of ids) {
    const followed = state.followed[id];
    const current = await readCard(id);
    if (!current) {
      // Deleted, or archived out of the anonymous query's reach. Either way
      // there is nothing left to narrate.
      delete state.followed[id];
      continue;
    }

    const msg = changeMessage(followed, current);
    if (msg) {
      if (options.verbose) console.log(`thread of ${id}: ${msg.content.replace(/\n/g, " | ")}`);
      const ok = await postToThread(followed.threadId, msg);
      // Only record what was actually told, so a failed post is retried on the
      // next check instead of being silently skipped.
      if (!ok) continue;
      console.log(`followed up ${id}`);
      await sleep(1200);
    }

    followed.pr = current.pr ?? null;
    followed.status = current.status ?? null;
    if (isFinalStatus(current.status)) delete state.followed[id];
  }

  // Always: the check itself moved `lastCheck`, and losing that would make the
  // next run check again immediately.
  writeState(options.statePath, state);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (!options.dryRun && !TOKEN) throw new FatalError("DISCORD_BOT_TOKEN is not set");

  let state = options.dryRun && options.since ? null : readState(options.statePath);

  // Bootstrap: marks where we are and announces nothing. This is what stops the
  // 62 old cards falling into the channel all at once on the first run.
  if ((!state || options.bootstrap) && !options.since) {
    const docs = await queryCards({ since: null, limit: 5 });
    const fresh = freshState(
      docs[0]?.createdAt ?? new Date().toISOString(),
      docs.map((d) => d.id),
    );
    if (options.dryRun) {
      console.log(`[dry-run] bootstrap would write the watermark at ${fresh.watermark}`);
      return;
    }
    writeState(options.statePath, fresh);
    console.log(`bootstrap: watermark at ${fresh.watermark}, 0 announcements`);
    return;
  }

  const manual = Boolean(options.since);
  const since = options.since ?? state.watermark;
  // `--since` with no state file is a manual rescue: start a state from scratch
  // rather than blowing up on null down in the loop.
  if (!state) state = freshState(since);

  const docs = await queryCards({ since, limit: options.limit });
  if (options.verbose) console.log(`${docs.length} card(s) in the query since ${since}`);

  // Many cards at once still wants a human -- but only when they arrived at
  // once. A backlog is drained `--max` at a time instead of blocking, because
  // blocking on it could never clear itself: the watermark moves only when
  // something is posted.
  if (!manual && isSaturated(docs)) {
    throw new FatalError(
      `flow saturated: ${SATURATION_MAX}+ cards in ${SATURATION_WINDOW_MS / 60000} min — check for spam and unblock with --since`,
    );
  }

  const alreadyAnnounced = new Set(state.announced);
  const pending = docs.filter((d) => !alreadyAnnounced.has(d.id)).reverse(); // oldest first
  if (!manual && pending.length > options.max) {
    // Visible on purpose: a drain in progress is not the happy path, and the
    // journal should say so until it finishes.
    console.log(`${pending.length} card(s) behind; announcing ${options.max} this tick`);
  }

  for (const card of pending.slice(0, options.max)) {
    const payload = buildMessage(card);

    if (options.dryRun) {
      console.log(JSON.stringify(payload, null, 2));
      continue;
    }

    const posted = await postToChannel(payload);
    // Written AFTER each post, not at the end of the batch: a crash here
    // repeats one message (visible, and gone with one click), whereas writing
    // first would lose the announcement in silence and nobody notices the
    // report that never went out.
    state.announced.push(card.id);
    if (state.announced.length > IDS_KEPT) {
      state.announced = state.announced.slice(-IDS_KEPT);
    }
    if (card.createdAt && orderKey(card.createdAt) > orderKey(state.watermark)) {
      state.watermark = card.createdAt;
    }
    state.consecutiveFailures = 0;
    state.alertSent = false;

    // After the card is recorded as announced, so a retry can never push twice.
    // Not conditional on `posted`: the phone is the path that still works when
    // Discord is the thing that broke.
    await pushNewCard(card);

    // The thread comes after the announcement is already saved as announced:
    // if this fails, the card does not get announced twice to get a thread.
    if (posted?.id && !isFinalStatus(card.status)) {
      const thread = await createThread(posted.id, threadName(card));
      if (thread?.id) {
        state.followed[card.id] = {
          threadId: thread.id,
          messageId: posted.id,
          pr: card.pr ?? null,
          status: card.status ?? null,
        };
      }
    }
    state.followed = prune(state.followed);

    writeState(options.statePath, state);
    if (posted) console.log(`announced ${card.id}`);
    await sleep(1200); // the per-channel bucket is ~5 msg / 5 s
  }

  if (options.dryRun) return;

  await followChanges(state, options);

  // Silence on the happy path: systemd already logs Starting/Finished on every
  // trigger, and 720 runs a day of "nothing new" only fill the journal.
  if (state.consecutiveFailures !== 0 || state.alertSent) {
    state.consecutiveFailures = 0;
    state.alertSent = false;
    writeState(options.statePath, state);
  }
}

/**
 * Silent failure is the real risk here: a tightened rule, a swapped key or a
 * revoked token takes the service down and the only sign is a red one-shot
 * every two minutes that nobody reads. After ~20 min of continuous failure it
 * warns once and goes quiet until things work again.
 *
 * It warns down **two** paths, and that is the whole lesson of 2026-10-20: the
 * bot lost Send Messages on the channel, so the service died and the alert
 * about it was posted to that same channel, where it was refused 8755 times in
 * a row and swallowed. Thirteen days of silence. The ntfy topic does not depend
 * on Discord being healthy, which is exactly what an alert about Discord needs.
 * Either path succeeding is enough to go quiet -- otherwise a dead channel
 * keeps the alarm un-sent forever, which is the bug being fixed here.
 */
async function deadman(path, error) {
  const state = readState(path);
  if (!state) return;
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= FAILURES_BEFORE_ALERT && !state.alertSent) {
    const minutes = state.consecutiveFailures * 2;
    // Portuguese: this is read on Adson's phone and in the community's channel.
    const text = `o anunciador de issues está falhando há ~${minutes} min: ${String(error.message).slice(0, 300)}`;

    const onPhone = await alertPhone(text);
    let onChannel = false;
    if (TOKEN) {
      try {
        await postToChannel({ allowed_mentions: { parse: [] }, content: `⚠️ ${text}` });
        onChannel = true;
      } catch {
        // Expected when Discord is the thing that broke. That is why the phone
        // was tried first instead of last.
      }
    }
    if (!onPhone && !onChannel) console.error("the deadman could not warn down any path");
    state.alertSent = onPhone || onChannel;
  }
  writeState(path, state);
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) {
  const options = parseArgs(process.argv.slice(2));
  main(process.argv.slice(2)).catch(async (err) => {
    console.error(err instanceof FatalError ? err.message : err);
    if (!options.dryRun) await deadman(options.statePath, err).catch(() => undefined);
    process.exit(1);
  });
}
