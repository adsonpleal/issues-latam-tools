#!/usr/bin/env node
// Traz as gravações .rrf do "Ajude o simulador a acertar as contas" para cá.
//
// Origem: projeto `simulador-latam-ro`, coleção `replay_submissions`.
// Destino: `issues` com tipo `replay`, o .rrf como anexo e o resumo do parser
// no campo `replay`.
//
//   node tools/migrar-gravacoes.mjs --dry-run
//   node tools/migrar-gravacoes.mjs
//
// TODAS chegam arquivadas, inclusive as que já tinham sido conferidas. Na
// origem a coleção é `allow read: if false` de propósito — o comentário das
// regras de lá diz que os envios não podem ficar atrás de uma URL adivinhável —
// e o consentimento que a pessoa marcou fala em o arquivo virar teste no
// repositório aberto, não em ficar publicado num quadro. Então nada da coleção
// antiga aparece em público sem alguém decidir ficha por ficha: a triagem é que
// tira do arquivo ao promover para backlog.

import { accessToken } from "./credencial.mjs";

const ORIGEM = "simulador-latam-ro";
const DESTINO = "issues-latam-tools";
const dryRun = process.argv.includes("--dry-run");

const urlOrigem = `https://firestore.googleapis.com/v1/projects/${ORIGEM}/databases/(default)/documents`;
const urlDestino = `https://firestore.googleapis.com/v1/projects/${DESTINO}/databases/(default)/documents`;

const token = await accessToken();
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// `status` da origem -> coluna daqui. O arquivamento é separado e vale para todas.
const STATUS = { new: "reportado", reviewed: "resolvido", rejected: "nao_sera_feito" };

// --- leitura de valores REST ----------------------------------------------

function decode(v) {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("bytesValue" in v) return v.bytesValue; // fica em base64 mesmo
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

// --- origem ----------------------------------------------------------------

const r = await fetch(`${urlOrigem}:runQuery`, {
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
if (!r.ok) throw new Error(`origem: ${r.status} ${(await r.text()).slice(0, 200)}`);

const envios = (await r.json())
  .filter((x) => x.document)
  .map((x) => ({ id: x.document.name.split("/").pop(), d: decodeFields(x.document.fields ?? {}) }));

console.log(`${envios.length} gravações na origem${dryRun ? " (dry-run)" : ""}`);

// --- transformação ---------------------------------------------------------

function titulo({ d }) {
  const s = d.summary ?? {};
  const classe = s.className || "Classe desconhecida";
  const quem = s.player ? ` — ${s.player}` : "";
  const nivel = s.baseLevel ? ` nv ${s.baseLevel}/${s.jobLevel ?? "?"}` : "";
  return `Gravação: ${classe}${nivel}${quem}`.slice(0, 120);
}

function descricao({ d }) {
  const s = d.summary ?? {};
  const linhas = [];
  if (d.notes) linhas.push(d.notes);
  const dur = s.durationMs ? `${Math.round(s.durationMs / 1000)}s` : "?";
  linhas.push(
    `Gravação de ${dur} com ${s.dummyHits ?? 0} golpes em dummy ` +
      `(${s.damageEvents ?? 0} eventos de dano no total), ` +
      `${s.equipChangeCount ?? 0} trocas de equipamento e ` +
      `${s.learnedSkillCount ?? 0} habilidades aprendidas. ` +
      `Mapa ${s.map ?? "?"}. Arquivo ${d.fileName ?? "?"}.`,
  );
  return linhas.join("\n\n").slice(0, 4000);
}

let criados = 0;
let pulados = 0;
let erros = 0;
const contagem = {};

for (const envio of envios) {
  const { id, d } = envio;
  const status = STATUS[d.status] ?? "reportado";
  contagem[`${d.status} -> ${status}`] = (contagem[`${d.status} -> ${status}`] ?? 0) + 1;

  if (dryRun) {
    const kb = d.bytes ? Math.round((d.bytes.length * 3) / 4 / 1024) : 0;
    console.log(`  ${id}  ${status.padEnd(15)} ${kb}kB  ${titulo(envio)}`);
    continue;
  }

  // O resumo do parser vem inteiro: é o que a triagem lê para ranquear sem
  // baixar o .rrf.
  const replay = {
    ...(d.summary ?? {}),
    ...(d.traits ? { traits: d.traits, traitsSource: d.traitsSource ?? "form" } : {}),
    appVersion: d.appVersion ?? "",
    fileName: d.fileName ?? "",
  };

  const doc = {
    projeto: "simulador",
    titulo: titulo(envio),
    descricao: descricao(envio),
    tipo: "replay",
    status,
    // Todas arquivadas: nada da coleção privada vira público sem decisão humana.
    arquivado: true,
    upvotes: 0,
    comentarios: d.triageNote ? 1 : 0,
    anexos: d.bytes ? 1 : 0,
    criadoEm: d.uploadedAt ?? new Date().toISOString(),
    atualizadoEm: d.triagedAt ?? d.uploadedAt ?? new Date().toISOString(),
    origem: `simulador:replay_submissions/${id}`,
    replay,
    // O nick foi dado para crédito ("como você quer ser citado"), então é o
    // único campo de identificação que pode aparecer. Discord vai para o
    // subdocumento privado.
    ...(d.nick ? { autor: String(d.nick).slice(0, 40) } : {}),
  };

  const fields = encodeFields(doc);
  // criadoEm/atualizadoEm precisam virar timestamp, não string
  fields.criadoEm = { timestampValue: doc.criadoEm };
  fields.atualizadoEm = { timestampValue: doc.atualizadoEm };

  const res = await fetch(`${urlDestino}/issues/${id}?currentDocument.exists=false`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const corpo = await res.text();
    if (res.status === 409 || /already exists/i.test(corpo)) {
      pulados++;
      continue;
    }
    erros++;
    console.error(`erro em ${id}: ${corpo.slice(0, 200)}`);
    continue;
  }
  criados++;

  if (d.bytes) {
    const tamanho = Math.floor((d.bytes.length * 3) / 4) - (d.bytes.match(/=+$/)?.[0].length ?? 0);
    const a = await fetch(`${urlDestino}/issues/${id}/anexos/gravacao`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({
        fields: {
          nome: { stringValue: String(d.fileName ?? `${id}.rrf`).slice(0, 200) },
          tipo: { stringValue: "rrf" },
          tamanho: { integerValue: String(tamanho) },
          bytes: { bytesValue: d.bytes },
          criadoEm: { timestampValue: doc.criadoEm },
        },
      }),
    });
    if (!a.ok) console.error(`anexo de ${id}: ${(await a.text()).slice(0, 160)}`);
  }

  if (d.discord) {
    await fetch(`${urlDestino}/issues/${id}/privado/contato`, {
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
    await fetch(`${urlDestino}/issues/${id}/comentarios`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        fields: {
          texto: { stringValue: String(d.triageNote).slice(0, 4000) },
          autor: { stringValue: "Triagem" },
          autorUid: { stringValue: "migracao" },
          tipo: { stringValue: "mudanca" },
          criadoEm: { timestampValue: d.triagedAt ?? doc.criadoEm },
        },
      }),
    });
  }
}

console.log("mapeamento de status:", contagem);
if (!dryRun) console.log(`criados: ${criados} · pulados: ${pulados} · erros: ${erros}`);
