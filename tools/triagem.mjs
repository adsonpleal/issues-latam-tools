#!/usr/bin/env node
// The automatic triage queue: the board itself is the queue.
//
//   node tools/triagem.mjs bootstrap          # watermark = now, nothing from the past is taken
//   node tools/triagem.mjs queue              # what is ready to take, as JSON
//   node tools/triagem.mjs take <id>          # backlog -> em_progresso, locks the card
//   node tools/triagem.mjs pr <id> <owner/repo#N>
//   node tools/triagem.mjs refuse <id> --reason "..."    # stays in backlog, refused: true
//   node tools/triagem.mjs reconcile          # merged PR -> resolvido
//   node tools/triagem.mjs notify <id> --message "..."   # push to the phone
//   node tools/triagem.mjs alarm --message "..."         # same, with no card: the dispatcher
//   node tools/triagem.mjs state              # what the automation can see right now
//
// There is no queue in a file of its own, and that is the central decision:
// `status` in Firestore IS the queue. Taking a card means moving it to
// `em_progresso`, and Firestore refuses the second write (an updateTime
// precondition), so two dispatchers running at once cannot take the same card.
// As a bonus you see the queue on the board and pull a card out of it by
// dragging, without touching anything here.
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
// Writes are AUTHENTICATED (tools/credencial.mjs), unlike the announcer, which
// reads anonymously on purpose. Here there is no choice: moving a card and
// commenting are writes the rules only allow the admin. In exchange, this
// script never reads `privado/contato` -- there is no code path to it.
//
// Two vocabularies meet in this file, and keeping them apart is deliberate.
// Firestore field names (`titulo`, `descricao`, `criadoEm`, `atualizadoEm`,
// `projeto`, `tipo`, `autor`, `arquivado`, `upvotes`) and status values
// (`backlog`, `em_progresso`, `resolvido`) are a wire contract shared with the
// live board and the deployed site, so they stay exactly as the database spells
// them. Everything this file calls its own -- functions, locals, the card shape
// `toCard` returns -- is English. `toCard` is the one place the two meet, and
// every document write below names its fields explicitly rather than leaning on
// object shorthand, so no rename here can quietly rename a stored field.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { accessToken } from "./credencial.mjs";

const FIREBASE_PROJECT = process.env["FIREBASE_PROJECT_ID"] || "issues-latam-tools";
const BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

/** Outside the repository: state must not ride along in a commit nor vanish in a fresh clone. */
const STATE_FILE =
  process.env["TRIAGEM_ESTADO"] || join(homedir(), ".claude", "triagem-automatica", "estado.json");

/**
 * How many cards the automation may have in flight at once. The ceiling is not
 * Firestore's and not GitHub's: it is this machine, which runs the tests,
 * starts an instance and takes a screenshot for every session it dispatches.
 *
 * Five is a decision, not a measurement. Two was chosen when a card arrived
 * every few days; it became the bottleneck the moment a review session put
 * five approved cards in `backlog` at once and the queue could only drain two
 * of them. If the machine starts thrashing, this is the number to turn back
 * down -- or set `TRIAGEM_EM_VOO_MAX` for one run without editing the file.
 */
const IN_FLIGHT_MAX = Number(process.env["TRIAGEM_EM_VOO_MAX"] || 5);

const SITE = "https://issues.latam-tools.com.br";
/** Where the notification and the listener point. Exported so it is not two constants. */
export const cardUrl = (id) => `${SITE}/t/${encodeURIComponent(id)}`;

/**
 * Mirror of src/lib/projetos.ts -- and each project's repository. The keys are
 * the `projeto` values stored on a card, so they stay as the database spells
 * them.
 */
export const REPOS = {
  mercado: "adsonpleal/latam-market",
  simulador: "adsonpleal/latam-ro-calc",
  recap: "adsonpleal/ragreplaystats",
  visuais: "adsonpleal/latamvisuais",
  calc: "adsonpleal/ragcalc",
};

/** Where each repository is cloned on this machine. */
export const FOLDERS = {
  mercado: join(homedir(), "dev", "latam-market"),
  simulador: join(homedir(), "dev", "latam-ro-calc"),
  recap: join(homedir(), "dev", "ragreplaystats"),
  visuais: join(homedir(), "dev", "latamvisuais"),
  calc: join(homedir(), "dev", "ragcalc"),
};

// --- Local state -----------------------------------------------------------

/**
 * The keys in `estado.json` (`desde`, `ntfyTopico`) are persisted data, not
 * code: the file already exists on this machine, outside the repository, and
 * renaming a key there would read as "never bootstrapped" and quietly take the
 * whole backlog. So the stored spelling stays and the translation happens here,
 * at the boundary, the same way `toCard` handles Firestore's field names.
 */
function readState() {
  let stored = {};
  try {
    stored = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { since: null, ntfyTopic: null, stored: {} };
  }
  return { since: stored.desde ?? null, ntfyTopic: stored.ntfyTopico ?? null, stored };
}

/** Writes the watermark back under its stored name, keeping any other key the file holds. */
function writeWatermark(since, stored) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify({ ...stored, desde: since }, null, 2)}\n`);
}

// --- Firestore -------------------------------------------------------------

const str = (v) => ({ stringValue: v });
const bool = (v) => ({ booleanValue: v });
const ts = (v) => ({ timestampValue: new Date(v).toISOString() });

let tokenCache = null;
async function headers() {
  tokenCache ??= await accessToken();
  return { Authorization: `Bearer ${tokenCache}`, "Content-Type": "application/json" };
}

/**
 * Only the two statuses the queue can see: `backlog` (what it may take) and
 * `em_progresso` (what is already in flight). `reportado` is deliberately not
 * fetched -- not filtered out downstream, not fetched -- so a card nobody has
 * reviewed has no code path into this process at all. Single-field filter, so
 * it uses the automatic index; the ordering stays in memory, in `triageQueue`,
 * precisely to avoid needing a composite one.
 *
 * This used to list the whole collection. Since `queue` and `reconcile` both
 * run on every dispatcher cycle, that was ~580 reads every 15 minutes: the free
 * plan's daily quota ran out mid-afternoon, and it is the **same** quota the
 * public board draws on -- the automation was taking the site down for
 * visitors.
 */
async function activeCards() {
  const r = await fetch(`${BASE}:runQuery`, {
    method: "POST",
    headers: await headers(),
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
  return cardsFromQuery(await r.json());
}

/**
 * `runQuery` answers with a list, and **an error arrives as a row inside it**:
 * a blown quota comes back as `[{ error: { code: 429, ... } }]`, not as a bare
 * object. Anyone checking only `body.error` reads that as "no cards" and makes
 * the queue announce there is nothing to do -- a silent failure, on the very
 * path that exists to raise the alarm.
 */
export function cardsFromQuery(body) {
  const failure = Array.isArray(body) ? body.find((row) => row.error)?.error : body?.error;
  if (failure) throw new Error(`Firestore: ${failure.message}`);
  if (!Array.isArray(body)) {
    throw new Error(`Firestore: runQuery returned ${typeof body}, not a list`);
  }
  // A query with no results answers with a single row holding only `readTime`.
  return body.filter((row) => row.document).map((row) => toCard(row.document));
}

/** One card by id: a single read, instead of sweeping the collection for it. */
async function fetchCard(id) {
  const r = await fetch(`${BASE}/issues/${encodeURIComponent(id)}`, { headers: await headers() });
  if (r.status === 404) throw new Error(`card ${id} does not exist`);
  const j = await r.json();
  if (j.error) throw new Error(`card ${id}: ${j.error.message}`);
  if (!r.ok) throw new Error(`card ${id}: HTTP ${r.status}`);
  return toCard(j);
}

/**
 * `--flag value`, the way the rest of the automation already writes a command
 * line. Several names so the Portuguese spellings the skill still uses keep
 * working next to the English ones.
 */
const flag = (args, ...names) => {
  for (const name of names) {
    const i = args.indexOf(name);
    if (i >= 0) return args[i + 1] ?? "";
  }
  return "";
};

/**
 * The one place Firestore's field names cross into this file's own vocabulary.
 * Everything to the left of a colon is ours and English; everything inside
 * `f[...]` and `s(...)` is the name the database stores and must not change.
 */
export function toCard(doc) {
  const f = doc.fields ?? {};
  const s = (k) => f[k]?.stringValue ?? null;
  return {
    id: doc.name.split("/").pop(),
    updateTime: doc.updateTime,
    project: s("projeto"),
    title: s("titulo") ?? "",
    description: s("descricao") ?? "",
    type: s("tipo"),
    status: s("status"),
    author: s("autor"),
    pr: s("pr"),
    archived: Boolean(f["arquivado"]?.booleanValue),
    auto: Boolean(f["auto"]?.booleanValue),
    // Set by `refuse` when the automation turns down a card Adson approved. It
    // is a field of its own and not `auto: false`, because an absent `auto`
    // already reads as `false` on the line above -- that is every card nobody
    // picked.
    refused: Boolean(f["refused"]?.booleanValue),
    createdAt: f["criadoEm"]?.timestampValue ?? null,
    // When the card last moved, which for a card in `backlog` is when Adson
    // approved it. The queue's watermark keys on this, not on `createdAt`.
    updatedAt: f["atualizadoEm"]?.timestampValue ?? null,
  };
}

async function write(id, fields, { updateTime } = {}) {
  const mask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${f}`)
    .join("&");
  // The precondition is what makes `take` safe: if another dispatcher touched
  // the card between the read and this write, the server refuses with 400/409
  // instead of both of them believing they took it.
  const pre = updateTime ? `&currentDocument.updateTime=${encodeURIComponent(updateTime)}` : "";
  const r = await fetch(`${BASE}/issues/${id}?${mask}${pre}`, {
    method: "PATCH",
    headers: await headers(),
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) return { ok: false, body: (await r.text()).slice(0, 300) };
  return { ok: true };
}

/** The text is the reporter's to read, so it arrives in Portuguese and is stored as written. */
async function comment(id, text) {
  const r = await fetch(`${BASE}/issues/${id}/comentarios`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({
      fields: {
        texto: str(text),
        autor: str("Triagem automática"),
        autorUid: str("triagem-automatica"),
        tipo: str("mudanca"),
        criadoEm: ts(Date.now()),
      },
    }),
  });
  return r.ok;
}

// --- Phone notification ----------------------------------------------------

/**
 * Where tapping the notification lands.
 *
 * The rule is the only thing Adson needs to know by heart: **if the PR exists,
 * the link is the PR; if it does not, the link is the card.** A notification
 * that arrives with no PR is a card that never became one -- a report that does
 * not hold up, or a session that got stuck -- and what he needs to read in that
 * case is exactly the comment triage has just left on the card. Sending him to
 * GitHub there would be sending him nowhere.
 *
 * What decides is not the text the session writes, it is the card's `pr` field.
 * A session cannot get the link wrong by praising a PR it never opened.
 */
export function notificationLink(card) {
  if (!card.pr) return cardUrl(card.id);
  const [repo, number] = card.pr.split("#");
  return `https://github.com/${repo}/pull/${number}`;
}

/**
 * The ntfy topic, which **deliberately has no default in the code**. This
 * repository is public, and an ntfy topic is a password for whoever publishes
 * to it: anybody who learns the name can push a notification to his phone, with
 * `click` pointing at any URL they like -- a perfect lure. So it lives where the
 * rest of the automation's state already lives, outside the repository
 * (`estado.json`), or in the environment variable.
 */
function ntfyTopic() {
  const topic = process.env["TRIAGEM_NTFY_TOPICO"] || readState().ntfyTopic;
  if (!topic) {
    throw new Error(
      `no ntfy topic -- store 'ntfyTopico' in ${STATE_FILE} or set TRIAGEM_NTFY_TOPICO`,
    );
  }
  return topic;
}

/**
 * Publishes JSON to the ntfy root rather than using `Title`/`Click` headers on
 * a POST to the topic: an HTTP header does not carry UTF-8, and card titles
 * from here are accented ("Localização", "Colisão Astral"). Via the header path
 * they would reach the phone truncated or as mojibake.
 *
 * With a deadline, unlike the Firestore writes above: this is the last step of
 * a session, and a hanging POST would leave the card resolved with nobody told.
 */
async function notify({ title, message, link, tags }) {
  const r = await fetch("https://ntfy.sh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: ntfyTopic(), title, message, click: link, tags }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return { ok: false, body: (await r.text()).slice(0, 300) };
  return { ok: true };
}

// --- Screening for prompt injection ---------------------------------------

/**
 * The board is public: anybody can file a card. A card's title and description
 * are then pasted verbatim into the brief of a session that runs unattended
 * with write access to the board, `git push` and `gh`. So a card is text from a
 * stranger that reaches a tool-using agent, and some of it may be addressed to
 * that agent rather than describing a bug.
 *
 * This runs **before** any model reads the card, and that ordering is the whole
 * point: a detector that asks a model "is this an injection?" has already fed
 * it the injection. `triageQueue` and `take` are the only two ways a card
 * becomes a session, so both consult this, independently -- the dispatcher can
 * call `take <id>` straight past the queue, and has.
 *
 * It is a backstop behind the human, not a wall. This repository is public, so
 * these patterns are public too, and whoever reads them can write around them.
 * The defence that actually holds is the one in front of it: a person read this
 * card in their own language before it reached the queue. What this buys is
 * that the careless attempt never reaches an agent at all.
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
 * Screens the three fields that reach an agent: the title and the description
 * go into the brief, and the author goes into a pull request body as the credit
 * line.
 *
 * Returns `null` for a card that reads like a bug report, or
 * `{ rule, field, excerpt }` naming the rule, the field it fired on, and
 * enough text around the match to judge it by. The excerpt is what makes
 * dismissing a false positive cheap.
 */
export function screenForInjection(card) {
  for (const field of ["title", "description", "author"]) {
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

// --- Queue rules -----------------------------------------------------------

/**
 * What the automation may take right now: cards Adson has moved to `backlog`
 * himself. `replay` stays out because a recording is nobody's request -- it is
 * review material, and it is born archived.
 */
export function triageQueue(cards, { since, inFlightMax = IN_FLIGHT_MAX } = {}) {
  const inFlight = cards.filter((c) => !c.archived && c.auto && c.status === "em_progresso");
  const slots = Math.max(0, inFlightMax - inFlight.length);

  const candidates = cards
    .filter((c) => !c.archived && c.status === "backlog" && c.type !== "replay")
    .filter((c) => c.project in REPOS)
    // `refuse` leaves a turned-down card in `backlog` with `refused: true`.
    // Without this the queue would hand it to a fresh session every cycle,
    // forever.
    .filter((c) => !c.refused)
    // Keyed on `updatedAt`, the moment the card was moved into `backlog`.
    // Keying on `createdAt` would silently drop every older card Adson approves
    // -- the same shape of silent drop that kept the announcer quiet for
    // thirteen days.
    .filter((c) => !since || ((c.updatedAt ?? c.createdAt) > since))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  // A backstop, not the gate. A person read this card before it reached the
  // queue, so what is left for a regex to catch is what a tired reviewer skims
  // past, not the obvious attempt. A screened card stays in `backlog` and out
  // of the queue, with no public comment: naming the rule that caught it would
  // tell whoever wrote it what to avoid next time.
  const blocked = [];
  const ready = [];
  for (const c of candidates) {
    const screen = screenForInjection(c);
    if (screen) blocked.push({ ...c, screen });
    else ready.push(c);
  }

  return { ready, inFlight, slots, takeable: ready.slice(0, slots), blocked };
}

// --- Commands --------------------------------------------------------------

async function bootstrap() {
  const since = new Date().toISOString();
  const { stored } = readState();
  writeWatermark(since, stored);
  const { ready } = triageQueue(await activeCards(), { since: null });
  console.log(
    `watermark: ${since}\n` +
      `${ready.length} card(s) in 'backlog' were left behind -- the automation will not take them.\n` +
      `state in ${STATE_FILE}`,
  );
}

async function printQueue() {
  const { since } = readState();
  if (!since) throw new Error("no watermark -- run 'bootstrap' first");
  const r = triageQueue(await activeCards(), { since });
  console.log(
    JSON.stringify(
      {
        since,
        inFlight: r.inFlight.map((c) => ({ id: c.id, project: c.project, pr: c.pr })),
        slots: r.slots,
        takeable: r.takeable.map((c) => ({
          id: c.id,
          project: c.project,
          repo: REPOS[c.project],
          folder: FOLDERS[c.project],
          type: c.type,
          author: c.author,
          title: c.title,
          description: c.description,
          url: cardUrl(c.id),
        })),
        blocked: r.blocked.map((c) => ({
          id: c.id,
          project: c.project,
          title: c.title,
          ...c.screen,
          url: cardUrl(c.id),
        })),
      },
      null,
      2,
    ),
  );
}

async function takeCard(id) {
  if (!id) throw new Error("usage: take <id>");
  const card = await fetchCard(id);
  if (card.status !== "backlog") {
    throw new Error(
      `card ${id} is in '${card.status}', not 'backlog' -- the automation only takes what you moved there yourself`,
    );
  }

  // Checked here as well as in `triageQueue`, because a dispatcher can call
  // `take <id>` straight past the queue -- and has.
  const screen = screenForInjection(card);
  if (screen) {
    throw new Error(
      `card ${id} refused by the injection screen: ${screen.rule} in \`${screen.field}\` — ` +
        `"${screen.excerpt}". Read the card and decide by hand; the automation will not take it.`,
    );
  }

  const r = await write(
    id,
    {
      status: str("em_progresso"),
      arquivado: bool(false),
      auto: bool(true),
      atualizadoEm: ts(Date.now()),
    },
    { updateTime: card.updateTime },
  );
  if (!r.ok) throw new Error(`could not take ${id} (did somebody take it first?): ${r.body}`);
  console.log(
    JSON.stringify(
      {
        ...card,
        status: "em_progresso",
        auto: true,
        repo: REPOS[card.project],
        folder: FOLDERS[card.project],
      },
      null,
      2,
    ),
  );
}

async function recordPullRequest(id, ref) {
  if (!id || !ref) throw new Error("usage: pr <id> <owner/repo#N>");
  if (!/^[\w.-]+\/[\w.-]+#\d+$/.test(ref)) {
    throw new Error(`invalid reference: ${ref} (expected owner/repo#123)`);
  }
  const r = await write(id, { pr: str(ref), atualizadoEm: ts(Date.now()) });
  if (!r.ok) throw new Error(`could not record the PR on ${id}: ${r.body}`);
  console.log(`${id} -> ${ref}`);
}

async function refuseCard(id, ...rest) {
  const reason = flag(rest, "--reason", "--motivo");
  if (!id || !reason) throw new Error('usage: refuse <id> --reason "text"');
  // Stays in `backlog`, and `refused: true` is what takes it out of the queue.
  // Not `nao_sera_feito`, because closing a card in the reporter's face is
  // your decision and not the automation's. Not back to `reportado` either:
  // your judgement that this is a real bug still stands, and the automation
  // failing to fix it does not un-make it. The public comment, in the
  // reporter's language, says why.
  await comment(id, reason);
  const r = await write(id, {
    status: str("backlog"),
    refused: bool(true),
    arquivado: bool(false),
    atualizadoEm: ts(Date.now()),
  });
  if (!r.ok) throw new Error(`could not refuse ${id}: ${r.body}`);
  console.log(`${id} -> backlog (refused)`);
}

async function reconcile(...args) {
  const dryRun = args.includes("--dry-run");
  const { execFileSync } = await import("node:child_process");
  const cards = (await activeCards()).filter(
    (c) => !c.archived && c.status === "em_progresso" && c.pr,
  );
  let moved = 0;
  for (const c of cards) {
    const [repo, number] = c.pr.split("#");
    let data;
    try {
      data = JSON.parse(
        execFileSync("gh", ["pr", "view", number, "--repo", repo, "--json", "state,mergedAt,url"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    } catch (e) {
      console.error(`${c.id}: could not read ${c.pr} -- ${String(e.message).slice(0, 120)}`);
      continue;
    }
    if (data.state !== "MERGED") continue;
    if (dryRun) {
      console.log(`[dry-run] ${c.id} <- ${c.pr} merged at ${data.mergedAt}`);
      moved++;
      continue;
    }
    // The reporter reads this one, so it stays in Portuguese.
    await comment(
      c.id,
      `Resolvido em ${data.url}, mesclado em ${new Date(data.mergedAt).toLocaleDateString("pt-BR")}.`,
    );
    const r = await write(c.id, {
      status: str("resolvido"),
      arquivado: bool(false),
      atualizadoEm: ts(Date.now()),
    });
    if (!r.ok) {
      console.error(`${c.id}: ${r.body}`);
      continue;
    }
    console.log(`${c.id} -> resolvido (${c.pr})`);
    moved++;
  }
  console.log(`reconciled: ${moved} of ${cards.length} card(s) with a PR`);
}

/**
 * The end-of-card notification. The session writes the sentence; the link is
 * not the session's -- it comes off the card, through `notificationLink`. One
 * notification per card, at the end: progress does not go to anybody's phone.
 *
 * The id is required, and `--message` in its place is an error rather than
 * becoming an alarm: `notify "$ID" --message ...` with an empty variable has to
 * fail, not send a generic notification that looks like it worked.
 */
async function notifyAboutCard(id, ...rest) {
  const message = flag(rest, "--message", "--mensagem");
  if (!id || id.startsWith("--") || !message) {
    throw new Error('usage: notify <id> --message "text"');
  }

  const card = await fetchCard(id);
  const link = notificationLink(card);
  const r = await notify({
    title: card.title || card.id,
    message,
    link,
    // The project becomes a tag rather than going into the title: on a phone
    // screen the title is what gets read first, and there what matters is the
    // card.
    tags: [card.project, card.pr ? "rocket" : "speech_balloon"],
  });
  if (!r.ok) throw new Error(`could not notify about ${id}: ${r.body}`);
  console.log(`notified: ${id} -> ${link}`);
}

/** The dispatcher's own alarm, which has no card to point at. */
async function raiseAlarm(...rest) {
  const message = flag(rest, "--message", "--mensagem");
  if (!message) throw new Error('usage: alarm --message "text"');
  // "Triagem automática" is what shows on his phone, so it stays in Portuguese.
  const r = await notify({
    title: "Triagem automática",
    message,
    link: SITE,
    tags: ["warning"],
  });
  if (!r.ok) throw new Error(`could not raise the alarm: ${r.body}`);
  console.log(`alarm -> ${SITE}`);
}

async function printState() {
  const { since } = readState();
  const cards = await activeCards();
  const r = triageQueue(cards, { since });
  console.log(
    `watermark   : ${since ?? "(no bootstrap)"}\n` +
      `in flight   : ${r.inFlight.length}/${IN_FLIGHT_MAX}${r.inFlight.length ? ` — ${r.inFlight.map((c) => `${c.id}${c.pr ? ` (${c.pr})` : ""}`).join(", ")}` : ""}\n` +
      `ready       : ${r.ready.length}\n` +
      `takeable now: ${r.takeable.length}\n` +
      // Shown here and in `queue`, and deliberately NOT pushed to the phone:
      // a notification per screened card would hand a stranger a way to ring
      // Adson's phone at will, by filing cards. The dispatcher reads this
      // every cycle, which is where a blocked card belongs.
      `blocked     : ${r.blocked.length}${r.blocked.length ? ` — ${r.blocked.map((c) => `${c.id} (${c.screen.rule})`).join(", ")}` : ""}\n` +
      `state in    : ${STATE_FILE}`,
  );
}

/**
 * The command table. English names are the real ones; the Portuguese spellings
 * below them are aliases, kept because the triage skill and anything already in
 * flight still type those. They can go once no document names them.
 */
const commands = {
  bootstrap,
  queue: printQueue,
  take: takeCard,
  pr: recordPullRequest,
  refuse: refuseCard,
  reconcile,
  notify: notifyAboutCard,
  alarm: raiseAlarm,
  state: printState,

  fila: printQueue,
  pegar: takeCard,
  parar: refuseCard,
  reconciliar: reconcile,
  avisar: notifyAboutCard,
  alarme: raiseAlarm,
  estado: printState,
};

// --- Entry point -----------------------------------------------------------

const [command, ...args] = process.argv.slice(2);

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("triagem.mjs")) {
  if (!command || !(command in commands)) {
    console.error(`commands: ${Object.keys(commands).join(", ")}`);
    process.exit(2);
  }
  try {
    await commands[command](...args);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
