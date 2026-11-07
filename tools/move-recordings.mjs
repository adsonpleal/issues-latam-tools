#!/usr/bin/env node
// Takes the recordings that never became a card off the board and puts them in
// the `gravacoes` collection.
//
//   node tools/move-recordings.mjs --dry-run
//   node tools/move-recordings.mjs
//
// Recordings from "Ajude o simulador" used to be born as `arquivado: true`
// cards. That gave one boolean two meanings -- "triage dispatched it" and
// "nobody has looked yet" -- and left the inbox piled up in /admin's archived
// drawer, mixed in with bug cards archived for some other reason.
//
// A recording is input data now: it lives in `gravacoes`, which only the admin
// reads, and becomes a card when triage promotes it. This script moves what was
// left behind.
//
// IT ONLY TOUCHES WHAT IS NOT YET PUBLIC: a `tipo: "replay"` card with
// `arquivado: false` was already promoted under the old model, so it is a board
// card like any other and stays where it is.
//
// It is idempotent (creates with `currentDocument.exists=false`) and doubles as
// a sweep: while an old simulator build is still cached out there, a submission
// still lands as an archived card, and running this again collects it.
//
// The credential comes from `firebase login` (or GOOGLE_APPLICATION_CREDENTIALS).
// A user OAuth token talks to Firestore through IAM rather than through the
// rules -- which is what allows writing an old `criadoEm` and deleting the
// source card, two things the rules deny the world.
//
// Field names, collection names and the stored `estado` values below are
// Firestore's, so they keep the database's spelling.

import { accessToken } from "./credential.mjs";

const PROJECT_ID = "issues-latam-tools";
const dryRun = process.argv.includes("--dry-run");

const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const token = await accessToken();
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// Old-model status -> inbox state. `resolvido` there meant "I have gone through
// it", not "it is live".
const STATE_BY_STATUS = {
  reportado: "fila",
  backlog: "fila",
  em_progresso: "fila",
  resolvido: "conferida",
  nao_sera_feito: "descartada",
};

// --- REST codec ------------------------------------------------------------

function decode(v) {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("bytesValue" in v) return v.bytesValue; // stays base64 on purpose
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  return null;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  switch (typeof v) {
    case "string":
      return { stringValue: v };
    case "boolean":
      return { booleanValue: v };
    case "number":
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    default:
      return { mapValue: { fields: encodeFields(v) } };
  }
}

function encodeFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, encode(v)]));
}

async function get(path) {
  const r = await fetch(`${url}/${path}`, { headers: H });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return decodeFields(j.fields ?? {});
}

async function list(path) {
  const r = await fetch(`${url}/${path}?pageSize=300`, { headers: H });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.documents ?? []).map((d) => ({
    id: d.name.split("/").pop(),
    d: decodeFields(d.fields ?? {}),
  }));
}

async function remove(path) {
  const r = await fetch(`${url}/${path}`, { method: "DELETE", headers: H });
  if (!r.ok && r.status !== 404) {
    throw new Error(`delete ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
}

// --- what the submitter actually wrote -------------------------------------

/**
 * The card's description was the submitter's own note plus a sentence built
 * from the summary. Only the first half is theirs -- the tracker rebuilds the
 * second half itself when it promotes the recording.
 *
 * The marker is text already stored on live documents, so it stays in
 * Portuguese: this has to match what is there.
 */
function ownNotes(description) {
  const prefix = "Gravação de ";
  if (description.startsWith(prefix)) return "";
  const cut = description.indexOf(`\n\n${prefix}`);
  return cut === -1 ? description : description.slice(0, cut);
}

// --- the recordings still sitting on the board -----------------------------

const r = await fetch(`${url}:runQuery`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: "issues" }],
      where: {
        fieldFilter: { field: { fieldPath: "tipo" }, op: "EQUAL", value: { stringValue: "replay" } },
      },
      orderBy: [{ field: { fieldPath: "criadoEm" }, direction: "DESCENDING" }],
      limit: 500,
    },
  }),
});
if (!r.ok) throw new Error(`query: ${r.status} ${(await r.text()).slice(0, 200)}`);

const cards = (await r.json())
  .filter((x) => x.document)
  .map((x) => ({ id: x.document.name.split("/").pop(), d: decodeFields(x.document.fields ?? {}) }));

// One promoted under the old model is a genuinely public card -- it does not go
// back into the inbox.
const toMove = cards.filter((c) => c.d.arquivado === true);
const alreadyPublic = cards.length - toMove.length;

console.log(
  `${cards.length} replay cards · ${toMove.length} to move · ` +
    `${alreadyPublic} already public (left alone)${dryRun ? " (dry-run)" : ""}`,
);

let moved = 0;
let skipped = 0;
let failures = 0;

for (const { id, d } of toMove) {
  const state = STATE_BY_STATUS[d.status] ?? "fila";
  const attachment = await get(`issues/${id}/anexos/gravacao`);
  const priv = await get(`issues/${id}/privado/contato`);
  const comments = await list(`issues/${id}/comentarios`);

  if (dryRun) {
    const kb = attachment?.bytes ? Math.round((attachment.bytes.length * 3) / 4 / 1024) : 0;
    console.log(
      `  ${id}  ${state.padEnd(11)} ${String(kb).padStart(4)}kB  ` +
        `${attachment ? "" : "NO FILE  "}${d.titulo}`,
    );
    continue;
  }

  // Every key here is a Firestore field name, so each one is written out in
  // full rather than by shorthand -- shorthand would let renaming a local
  // silently rename a stored field.
  const recording = {
    titulo: String(d.titulo ?? "").slice(0, 120),
    notas: ownNotes(String(d.descricao ?? "")).slice(0, 4000),
    resumo: d.replay ?? {},
    nome: String(attachment?.nome ?? `${id}.rrf`).slice(0, 200),
    tamanho: Number(attachment?.tamanho ?? 0),
    estado: state,
    origem: `issues/${id}`,
    ...(d.autor ? { nick: String(d.autor).slice(0, 40) } : {}),
    ...(priv?.contato ? { contato: String(priv.contato).slice(0, 120) } : {}),
    // What triage had noted became a comment on the card; here it goes back to
    // being a private annotation, which is what it always was.
    ...(comments[0]?.d?.texto
      ? { notaTriagem: String(comments[0].d.texto).slice(0, 4000) }
      : {}),
  };

  const fields = encodeFields(recording);
  fields.criadoEm = { timestampValue: d.criadoEm ?? new Date().toISOString() };
  if (state !== "fila") {
    fields.decididaEm = { timestampValue: d.atualizadoEm ?? d.criadoEm ?? new Date().toISOString() };
  }

  const res = await fetch(`${url}/gravacoes/${id}?currentDocument.exists=false`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Already moved on an earlier run: it is the source card that was left
    // behind.
    if (res.status !== 409 && !/already exists/i.test(body)) {
      failures++;
      console.error(`failed on ${id}: ${body.slice(0, 200)}`);
      continue;
    }
    skipped++;
  } else {
    moved++;
  }

  if (attachment?.bytes) {
    const a = await fetch(`${url}/gravacoes/${id}/arquivo/rrf`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({
        fields: {
          nome: { stringValue: String(attachment.nome ?? `${id}.rrf`).slice(0, 200) },
          tipo: { stringValue: "rrf" },
          tamanho: { integerValue: String(attachment.tamanho ?? 0) },
          bytes: { bytesValue: attachment.bytes },
          criadoEm: { timestampValue: d.criadoEm ?? new Date().toISOString() },
        },
      }),
    });
    if (!a.ok) {
      failures++;
      console.error(`file of ${id}: ${(await a.text()).slice(0, 160)}`);
      // Without the .rrf the recording is useless, and deleting the card would
      // take the file with it -- so this id stays in both places until somebody
      // looks.
      continue;
    }
  }

  // Only now does the card leave the board. A subcollection does not go with
  // its parent, so each one is deleted by hand -- and the attachment is exactly
  // the heavy document.
  for (const c of comments) await remove(`issues/${id}/comentarios/${c.id}`);
  for (const p of await list(`issues/${id}/privado`)) await remove(`issues/${id}/privado/${p.id}`);
  for (const an of await list(`issues/${id}/anexos`)) await remove(`issues/${id}/anexos/${an.id}`);
  await remove(`issues/${id}`);
}

if (!dryRun) console.log(`moved: ${moved} · already there: ${skipped} · failed: ${failures}`);
