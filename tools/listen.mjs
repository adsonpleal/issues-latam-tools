#!/usr/bin/env node
// Listens to the board and announces each new card on one line.
//
//   node tools/listen.mjs            # keeps listening; one stdout line per new card
//   node tools/listen.mjs --mark     # prints the stored watermark and exits
//
// Replaces the scheduled dispatcher. That one woke every 15 minutes to ask
// Firestore whether a new card had arrived: 54 reads per cycle and a whole model
// turn per question, almost always to hear "no". Here Firestore does the
// talking. The initial snapshot costs one read per card in `reportado` (fewer
// than 20 today) and after that it is one read per change.
//
// **Every stdout line becomes a notification in the session that is listening.**
// That is why a line is printed only for a genuinely new card, or when the
// listener dies. Everything diagnostic goes to stderr, which notifies nobody.
//
// Queries UNAUTHENTICATED, with the identity of an anonymous visitor, for the
// same reason the Discord announcer does: the rules allow listing
// `arquivado == false` with `limit <= 500` and deny `privado/contato` to anyone
// who is not the admin, so this process CANNOT read the reporter's contact
// details, not even by accident. An admin credential would override the rules
// and throw that guarantee away. Whatever moves the card afterwards is
// `triagem.mjs`, which is authenticated precisely because writing demands it.
//
// A resident process has the flaw the announcer describes: a stalled poller
// stays "alive" forever with its announcements stopped. What cuts that here is
// the clock of whoever arms the listener, which restarts it from time to time,
// and the on-disk watermark makes a restart neither lose nor repeat a card.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { initializeApp } from "firebase/app";
import { collection, getFirestore, limit, onSnapshot, query, where } from "firebase/firestore";

import { REPOS, urlDoCard } from "./triagem.mjs";

/** Mirrors src/lib/firebase.ts. Public web key: it already ships in the site bundle. */
const CONFIG = {
  apiKey: process.env["FIREBASE_API_KEY"] || "AIzaSyCcBw2edbq0x15csy4h4w_ZBZOGnpNvBro",
  projectId: process.env["FIREBASE_PROJECT_ID"] || "issues-latam-tools",
};

/**
 * Next to the `estado.json` that `triagem.mjs` keeps, but in a file of its own:
 * that one holds the ntfy topic and the `bootstrap` watermark, and two
 * concurrent writes to the same file would lose one of them.
 */
const MARK_FILE =
  process.env["LISTEN_MARK"] || join(homedir(), ".claude", "triagem-automatica", "listen.json");

const STATE_FILE =
  process.env["TRIAGEM_ESTADO"] || join(homedir(), ".claude", "triagem-automatica", "estado.json");

// --- The rule, kept apart from the network ---------------------------------

/**
 * A bare instant: the two fields and nothing else. The SDK's `Timestamp` carries
 * a `toJSON`, and storing it directly would push
 * `type: "firestore/timestamp/1.0"` into a state file that is ours, a shape we
 * would then have to keep accepting if the SDK ever changed its mind.
 */
export function instant(value) {
  if (!value || typeof value.seconds !== "number" || typeof value.nanoseconds !== "number") {
    return null;
  }
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}

/**
 * Compares two Firestore instants by their raw fields, never through `Date`.
 * Firestore stamps microseconds and `Date` truncates to milliseconds: a
 * truncated watermark lands BEFORE the card it came from, and that card becomes
 * news again on every restart, forever. The Discord announcer takes the same
 * care, for the same reason.
 */
export function isAfter(a, b) {
  if (!b) return true;
  if (a.seconds !== b.seconds) return a.seconds > b.seconds;
  return a.nanoseconds > b.nanoseconds;
}

/**
 * What is new in this snapshot, and the watermark that replaces the old one.
 *
 * `replay` is left out because a recording is nobody's request, and so is a
 * project with no known repository: the same cuts `maduros` makes in
 * `triagem.mjs`. They are repeated here on purpose, because announcing what the
 * queue would never take is a notification for nothing. What the automation
 * actually picks up is still the queue's call, not the listener's.
 *
 * A discarded card **moves the watermark just the same**. If it did not, it
 * would be re-examined on every restart: cheap, but a lie about what the
 * listener has already seen.
 */
export function freshCards(cards, mark) {
  let highest = mark;
  const fresh = [];
  for (const card of cards) {
    const createdAt = instant(card.criadoEm);
    if (!createdAt || !isAfter(createdAt, mark)) continue;
    if (isAfter(createdAt, highest)) highest = createdAt;
    if (card.tipo === "replay") continue;
    if (!(card.projeto in REPOS)) continue;
    fresh.push(card);
  }
  return { fresh, mark: highest };
}

/** One line per card, read by a person on a phone: id first, link last. */
export function announcement(card) {
  return `NEW ${card.id} | ${card.projeto} | ${card.titulo} | ${urlDoCard(card.id)}`;
}

// --- Disk -------------------------------------------------------------------

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/**
 * The first watermark is the one `bootstrap` wrote, in `estado.json`. Without it
 * the listener would dump the whole board on its first run: exactly the pile of
 * `reportado` that `bootstrap` exists to leave where it is.
 */
function storedMark() {
  const stored = instant(readJson(MARK_FILE).mark);
  if (stored) return stored;
  const since = readJson(STATE_FILE).desde;
  if (!since) throw new Error(`no watermark yet — run 'triagem bootstrap' first (${STATE_FILE})`);
  const ms = Date.parse(since);
  return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 };
}

/** Writes through a rename, which is atomic: a restart mid-write never reads half a watermark. */
function saveMark(mark) {
  mkdirSync(dirname(MARK_FILE), { recursive: true });
  const temp = `${MARK_FILE}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ mark }, null, 2)}\n`);
  renameSync(temp, MARK_FILE);
}

// --- Listening --------------------------------------------------------------

function die(text, code = 1) {
  // Goes to stdout on purpose, unlike the rest of the diagnostics: a listener
  // that died in silence is indistinguishable from a quiet board, and that is
  // the one silence that must not happen.
  console.log(`LISTENER DIED: ${text}`);
  process.exit(code);
}

function listen() {
  let mark = storedMark();
  process.stderr.write(`listening from ${mark.seconds}.${mark.nanoseconds}\n`);

  const db = getFirestore(initializeApp(CONFIG));
  const board = query(
    collection(db, "issues"),
    // `arquivado == false` is not our filter, it is what the rule demands: `list`
    // is evaluated against the QUERY, and without it Firestore rejects the whole
    // thing before reading a single document.
    where("arquivado", "==", false),
    where("status", "==", "reportado"),
    limit(500),
  );

  onSnapshot(
    board,
    { includeMetadataChanges: false },
    (snapshot) => {
      const cards = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const result = freshCards(cards, mark);
      for (const card of result.fresh) console.log(announcement(card));
      if (result.mark !== mark) {
        mark = result.mark;
        saveMark(mark);
      }
    },
    (error) => die(`${error.code || "error"} — ${error.message}`),
  );
}

/**
 * The guard is the announcer's, built on `pathToFileURL`, and not the
 * `file://` + `argv[1]` comparison that `triagem.mjs` uses: on Windows the path
 * arrives with backslashes and a drive letter, so the raw form never matches.
 * With no guard at all, importing this module — and the test imports it — opened
 * a real listener against Firestore.
 */
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) {
  if (process.argv.includes("--mark")) {
    process.stdout.write(`${JSON.stringify(storedMark())}\n`);
  } else {
    try {
      listen();
    } catch (error) {
      die(error.message);
    }
  }
}
