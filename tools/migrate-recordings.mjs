#!/usr/bin/env node
// Brings the .rrf recordings from "Ajude o simulador a acertar as contas" over
// to this board.
//
// Source: project `simulador-latam-ro`, collection `replay_submissions`.
// Target: `issues` with type `replay`, the .rrf as an attachment and the
// parser's summary in the `replay` field.
//
//   node tools/migrate-recordings.mjs --dry-run
//   node tools/migrate-recordings.mjs
//
// ALL of them arrive archived, including the ones already reviewed. In the
// source the collection is `allow read: if false` on purpose -- the comment on
// those rules says submissions must not sit behind a guessable URL -- and the
// consent the person ticked talks about the file becoming a test in the open
// repository, not about being published on a board. So nothing from the old
// collection shows up in public without somebody deciding card by card: it is
// triage that takes it out of the archive by promoting it to backlog.
//
// The fields written below are Firestore's and the `status` values are the
// board's stored ones, so both keep the database's spelling. The text this
// builds for a card's title and description is read by the community, so it
// stays in Portuguese.

import { accessToken } from "./credential.mjs";

const SOURCE_PROJECT = "simulador-latam-ro";
const TARGET_PROJECT = "issues-latam-tools";
const dryRun = process.argv.includes("--dry-run");

const sourceUrl = `https://firestore.googleapis.com/v1/projects/${SOURCE_PROJECT}/databases/(default)/documents`;
const targetUrl = `https://firestore.googleapis.com/v1/projects/${TARGET_PROJECT}/databases/(default)/documents`;

const token = await accessToken();
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// The source's `status` -> a column here. Archiving is separate and applies to
// all of them.
const STATUS_BY_SOURCE = { new: "reportado", reviewed: "resolvido", rejected: "nao_sera_feito" };

// --- reading REST values ---------------------------------------------------

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

// --- the source ------------------------------------------------------------

const r = await fetch(`${sourceUrl}:runQuery`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: "replay_submissions" }],
      orderBy: [{ field: { fieldPath: "uploadedAt" }, direction: "DESCENDING" }],
      limit: 500,
    },
  }),
});
if (!r.ok) throw new Error(`source: ${r.status} ${(await r.text()).slice(0, 200)}`);

const submissions = (await r.json())
  .filter((x) => x.document)
  .map((x) => ({ id: x.document.name.split("/").pop(), d: decodeFields(x.document.fields ?? {}) }));

console.log(`${submissions.length} recordings in the source${dryRun ? " (dry-run)" : ""}`);

// --- transformation --------------------------------------------------------

function cardTitle({ d }) {
  const s = d.summary ?? {};
  const cls = s.className || "Classe desconhecida";
  const who = s.player ? ` — ${s.player}` : "";
  const level = s.baseLevel ? ` nv ${s.baseLevel}/${s.jobLevel ?? "?"}` : "";
  return `Gravação: ${cls}${level}${who}`.slice(0, 120);
}

function cardDescription({ d }) {
  const s = d.summary ?? {};
  const lines = [];
  if (d.notes) lines.push(d.notes);
  const dur = s.durationMs ? `${Math.round(s.durationMs / 1000)}s` : "?";
  lines.push(
    `Gravação de ${dur} com ${s.dummyHits ?? 0} golpes em dummy ` +
      `(${s.damageEvents ?? 0} eventos de dano no total), ` +
      `${s.equipChangeCount ?? 0} trocas de equipamento e ` +
      `${s.learnedSkillCount ?? 0} habilidades aprendidas. ` +
      `Mapa ${s.map ?? "?"}. Arquivo ${d.fileName ?? "?"}.`,
  );
  return lines.join("\n\n").slice(0, 4000);
}

let created = 0;
let skipped = 0;
let failures = 0;
const counts = {};

for (const submission of submissions) {
  const { id, d } = submission;
  const column = STATUS_BY_SOURCE[d.status] ?? "reportado";
  counts[`${d.status} -> ${column}`] = (counts[`${d.status} -> ${column}`] ?? 0) + 1;

  if (dryRun) {
    const kb = d.bytes ? Math.round((d.bytes.length * 3) / 4 / 1024) : 0;
    console.log(`  ${id}  ${column.padEnd(15)} ${kb}kB  ${cardTitle(submission)}`);
    continue;
  }

  // The parser's summary comes over whole: it is what triage reads to rank a
  // recording without downloading the .rrf.
  const replaySummary = {
    ...(d.summary ?? {}),
    ...(d.traits ? { traits: d.traits, traitsSource: d.traitsSource ?? "form" } : {}),
    appVersion: d.appVersion ?? "",
    fileName: d.fileName ?? "",
  };

  // Every key here is a Firestore field name, written out in full rather than
  // by shorthand -- shorthand would let renaming a local silently rename a
  // stored field.
  const doc = {
    projeto: "simulador",
    titulo: cardTitle(submission),
    descricao: cardDescription(submission),
    tipo: "replay",
    status: column,
    // All archived: nothing from the private collection becomes public without
    // a human decision.
    arquivado: true,
    upvotes: 0,
    comentarios: d.triageNote ? 1 : 0,
    anexos: d.bytes ? 1 : 0,
    criadoEm: d.uploadedAt ?? new Date().toISOString(),
    atualizadoEm: d.triagedAt ?? d.uploadedAt ?? new Date().toISOString(),
    origem: `simulador:replay_submissions/${id}`,
    replay: replaySummary,
    // The nickname was given for credit ("how would you like to be cited"), so
    // it is the only identifying field that may show. Discord goes to the
    // private subdocument.
    ...(d.nick ? { autor: String(d.nick).slice(0, 40) } : {}),
  };

  const fields = encodeFields(doc);
  // criadoEm/atualizadoEm have to become timestamps, not strings
  fields.criadoEm = { timestampValue: doc.criadoEm };
  fields.atualizadoEm = { timestampValue: doc.atualizadoEm };

  const res = await fetch(`${targetUrl}/issues/${id}?currentDocument.exists=false`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 409 || /already exists/i.test(body)) {
      skipped++;
      continue;
    }
    failures++;
    console.error(`failed on ${id}: ${body.slice(0, 200)}`);
    continue;
  }
  created++;

  if (d.bytes) {
    const size = Math.floor((d.bytes.length * 3) / 4) - (d.bytes.match(/=+$/)?.[0].length ?? 0);
    const a = await fetch(`${targetUrl}/issues/${id}/anexos/gravacao`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({
        fields: {
          nome: { stringValue: String(d.fileName ?? `${id}.rrf`).slice(0, 200) },
          tipo: { stringValue: "rrf" },
          tamanho: { integerValue: String(size) },
          bytes: { bytesValue: d.bytes },
          criadoEm: { timestampValue: doc.criadoEm },
        },
      }),
    });
    if (!a.ok) console.error(`attachment of ${id}: ${(await a.text()).slice(0, 160)}`);
  }

  if (d.discord) {
    await fetch(`${targetUrl}/issues/${id}/privado/contato`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({
        fields: {
          contato: { stringValue: String(d.discord).slice(0, 120) },
          criadoEm: { timestampValue: doc.criadoEm },
        },
      }),
    });
  }

  if (d.triageNote) {
    await fetch(`${targetUrl}/issues/${id}/comentarios`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        fields: {
          texto: { stringValue: String(d.triageNote).slice(0, 4000) },
          // Shown on the public card, so these stay in Portuguese.
          autor: { stringValue: "Triagem" },
          autorUid: { stringValue: "migracao" },
          tipo: { stringValue: "mudanca" },
          criadoEm: { timestampValue: d.triagedAt ?? doc.criadoEm },
        },
      }),
    });
  }
}

console.log("status mapping:", counts);
if (!dryRun) console.log(`created: ${created} · skipped: ${skipped} · failed: ${failures}`);
