#!/usr/bin/env node
// Loads data/seed-issues.json into Firestore. Idempotent: running it again
// neither duplicates anything nor undoes triage already done by hand.
//
//   node tools/seed.mjs --dry-run
//   node tools/seed.mjs
//   node tools/seed.mjs --force            # overwrites what is already there
//   node tools/seed.mjs --project other-id
//
// Talks to Firestore's REST API instead of firebase-admin: the admin SDK only
// accepts a service account credential for Firestore, while the REST API
// accepts the token `firebase login` already left on the machine. One less
// setup step. An authenticated write like this overrides the security rules --
// it is the only path that can write `origem`, for one thing.
//
// The keys read off each item (`projeto`, `titulo`, `criadoEm`, …) are the seed
// file's own, and the fields written are Firestore's; both are spelled the way
// they are stored, not the way this script names things.

import { readFileSync } from "node:fs";

import { accessToken } from "./credencial.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const projectId = args.includes("--project")
  ? args[args.indexOf("--project") + 1]
  : "issues-latam-tools";

const PROJECTS = ["visuais", "simulador", "recap", "mercado", "calc"];
const STATUSES = ["reportado", "backlog", "em_progresso", "resolvido", "nao_sera_feito"];
const ISSUE_TYPES = ["bug", "feature"];

const BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// --- Validation ------------------------------------------------------------

function validate(item, i) {
  const fail = (msg) => `item ${i} (${item.id ?? "no id"}): ${msg}`;

  if (!item.id || typeof item.id !== "string") throw new Error(fail("no id"));
  if (!PROJECTS.includes(item.projeto)) throw new Error(fail(`invalid project: ${item.projeto}`));
  if (!STATUSES.includes(item.status)) throw new Error(fail(`invalid status: ${item.status}`));
  if (!ISSUE_TYPES.includes(item.tipo)) throw new Error(fail(`invalid type: ${item.tipo}`));
  if (typeof item.titulo !== "string" || item.titulo.length < 3 || item.titulo.length > 120) {
    throw new Error(fail(`title outside 3..120 (${item.titulo?.length})`));
  }
  if (typeof item.descricao !== "string" || item.descricao.length > 4000) {
    throw new Error(fail("description missing or over 4000"));
  }
  // Loud failure on purpose: a single document without `arquivado` breaks the
  // board's query for EVERYONE, because the `allow list` rule evaluates
  // `resource.data.arquivado` (see firestore.rules).
  if (typeof item.arquivado !== "boolean") throw new Error(fail("`arquivado` must be a boolean"));
  if (!Number.isInteger(item.upvotes) || item.upvotes < 0) throw new Error(fail("invalid upvotes"));
  if (Number.isNaN(Date.parse(item.criadoEm))) throw new Error(fail("invalid criadoEm"));
}

// --- REST encoding ---------------------------------------------------------

const str = (v) => ({ stringValue: v });
const int = (v) => ({ integerValue: String(v) });
const bool = (v) => ({ booleanValue: v });
const ts = (v) => ({ timestampValue: new Date(v).toISOString() });

// --- The load --------------------------------------------------------------

const items = JSON.parse(readFileSync("data/seed-issues.json", "utf8"));
items.forEach(validate);

const ids = new Set();
for (const i of items) {
  if (ids.has(i.id)) throw new Error(`duplicate id: ${i.id}`);
  ids.add(i.id);
}

console.log(`${items.length} items validated, project ${projectId}${dryRun ? " (dry-run)" : ""}`);

if (dryRun) {
  const byStatus = {};
  for (const i of items) {
    const key = i.arquivado ? "arquivado" : i.status;
    byStatus[key] = (byStatus[key] ?? 0) + 1;
  }
  console.log("distribution:", byStatus);
  console.log(`comments to create: ${items.filter((i) => i.nota).length}`);
  console.log(`private contacts to create: ${items.filter((i) => i.contato).length}`);
  process.exit(0);
}

const token = await accessToken();
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function write(path, fields, { createOnly = false } = {}) {
  // `currentDocument.exists=false` is the SDK's `create()`: if the document
  // already exists the server refuses instead of overwriting. That is what
  // stops the seed sending a card already moved to `em_progresso` back to
  // `reportado`.
  const url = `${BASE}/${path}${createOnly ? "?currentDocument.exists=false" : ""}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) {
    const body = await r.text();
    const alreadyExists = r.status === 409 || /already exists|ALREADY_EXISTS/i.test(body);
    return { ok: false, alreadyExists, body };
  }
  return { ok: true };
}

let created = 0;
let skipped = 0;
let failures = 0;

for (const item of items) {
  const doc = {
    projeto: str(item.projeto),
    titulo: str(item.titulo),
    descricao: str(item.descricao),
    tipo: str(item.tipo),
    status: str(item.status),
    arquivado: bool(item.arquivado),
    upvotes: int(item.upvotes),
    comentarios: int(item.nota ? 1 : 0),
    criadoEm: ts(item.criadoEm),
    atualizadoEm: ts(item.atualizadoEm ?? item.criadoEm),
    origem: str(item.origem),
  };

  const r = await write(`issues/${item.id}`, doc, { createOnly: !force });
  if (!r.ok) {
    if (r.alreadyExists) {
      skipped++;
      continue;
    }
    failures++;
    console.error(`failed on ${item.id}: ${r.body.slice(0, 200)}`);
    continue;
  }
  created++;

  if (item.contato) {
    // A subdocument only the admin reads. Whoever filled in the spreadsheet
    // answered a private form and never agreed to have an e-mail or Discord
    // handle published.
    const c = await write(`issues/${item.id}/privado/contato`, {
      contato: str(item.contato),
      criadoEm: ts(item.criadoEm),
    });
    if (!c.ok) console.error(`contact of ${item.id}: ${c.body.slice(0, 120)}`);
  }

  if (item.nota) {
    const n = await fetch(`${BASE}/issues/${item.id}/comentarios`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fields: {
          texto: str(item.nota),
          // Shown on the public card, so the author's name stays in Portuguese.
          autor: str("Migração"),
          autorUid: str("seed"),
          tipo: str("mudanca"),
          criadoEm: ts(item.criadoEm),
        },
      }),
    });
    if (!n.ok) console.error(`note of ${item.id}: ${(await n.text()).slice(0, 120)}`);
  }
}

console.log(`created: ${created} · skipped: ${skipped} · failed: ${failures}`);
process.exit(failures > 0 ? 1 : 0);
