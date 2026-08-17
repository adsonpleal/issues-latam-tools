#!/usr/bin/env node
// Tira do quadro as gravações que ainda não viraram card e as põe na coleção
// `gravacoes`.
//
//   node tools/mover-gravacoes.mjs --dry-run
//   node tools/mover-gravacoes.mjs
//
// As gravações do "Ajude o simulador" nasciam como card `arquivado: true`. Isso
// dava dois sentidos para o mesmo booleano — "a triagem despachou" e "ninguém
// olhou ainda" — e deixava a caixa de entrada empilhada na gaveta de arquivados
// do /admin, misturada com card de bug que foi arquivado por outro motivo.
//
// Agora gravação é dado de entrada: mora em `gravacoes`, que só o admin lê, e
// vira card quando a triagem promove. Este script move o que ficou para trás.
//
// SÓ MEXE NO QUE AINDA NÃO É PÚBLICO: card `tipo: "replay"` com
// `arquivado: false` já foi promovido no modelo antigo, então é uma ficha do
// quadro como qualquer outra e fica onde está.
//
// É idempotente (cria com `currentDocument.exists=false`) e serve de varredura:
// enquanto houver simulador antigo em cache por aí, um envio ainda cai como card
// arquivado, e rodar isto de novo o recolhe.
//
// A credencial vem do `firebase login` (ou de GOOGLE_APPLICATION_CREDENTIALS).
// Token de OAuth do usuário fala com o Firestore por IAM, e não pelas regras —
// que é o que permite escrever `criadoEm` antigo e apagar o card de origem, duas
// coisas que as regras negam para o mundo.

import { accessToken } from "./credencial.mjs";

const PROJETO = "issues-latam-tools";
const dryRun = process.argv.includes("--dry-run");

const url = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;
const token = await accessToken();
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// Status do modelo antigo -> estado da caixa de entrada. `resolvido` ali queria
// dizer "já conferi com ela", e não "está no ar".
const ESTADO = {
  reportado: "fila",
  backlog: "fila",
  em_progresso: "fila",
  resolvido: "conferida",
  nao_sera_feito: "descartada",
};

// --- codec REST ------------------------------------------------------------

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

async function pegar(caminho) {
  const r = await fetch(`${url}/${caminho}`, { headers: H });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return decodeFields(j.fields ?? {});
}

async function listar(caminho) {
  const r = await fetch(`${url}/${caminho}?pageSize=300`, { headers: H });
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.documents ?? []).map((d) => ({
    id: d.name.split("/").pop(),
    d: decodeFields(d.fields ?? {}),
  }));
}

async function apagar(caminho) {
  const r = await fetch(`${url}/${caminho}`, { method: "DELETE", headers: H });
  if (!r.ok && r.status !== 404) {
    throw new Error(`apagar ${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
}

// --- o que veio da observação de quem enviou -------------------------------

/**
 * A descrição do card era a observação de quem gravou, mais uma frase montada a
 * partir do resumo. Só a primeira metade é dela — a segunda o tracker remonta
 * sozinho quando promove.
 */
function separaNotas(descricao) {
  const marca = "Gravação de ";
  if (descricao.startsWith(marca)) return "";
  const corte = descricao.indexOf(`\n\n${marca}`);
  return corte === -1 ? descricao : descricao.slice(0, corte);
}

// --- as gravações que ficaram no quadro ------------------------------------

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
if (!r.ok) throw new Error(`consulta: ${r.status} ${(await r.text()).slice(0, 200)}`);

const fichas = (await r.json())
  .filter((x) => x.document)
  .map((x) => ({ id: x.document.name.split("/").pop(), d: decodeFields(x.document.fields ?? {}) }));

// Promovida no modelo antigo é card público de verdade — não volta para a caixa.
const paraMover = fichas.filter((f) => f.d.arquivado === true);
const publicas = fichas.length - paraMover.length;

console.log(
  `${fichas.length} fichas tipo replay · ${paraMover.length} para mover · ` +
    `${publicas} já públicas (ficam)${dryRun ? " (dry-run)" : ""}`,
);

let movidas = 0;
let puladas = 0;
let erros = 0;

for (const { id, d } of paraMover) {
  const estado = ESTADO[d.status] ?? "fila";
  const anexo = await pegar(`issues/${id}/anexos/gravacao`);
  const privado = await pegar(`issues/${id}/privado/contato`);
  const comentarios = await listar(`issues/${id}/comentarios`);

  if (dryRun) {
    const kb = anexo?.bytes ? Math.round((anexo.bytes.length * 3) / 4 / 1024) : 0;
    console.log(
      `  ${id}  ${estado.padEnd(11)} ${String(kb).padStart(4)}kB  ` +
        `${anexo ? "" : "SEM ARQUIVO  "}${d.titulo}`,
    );
    continue;
  }

  const gravacao = {
    titulo: String(d.titulo ?? "").slice(0, 120),
    notas: separaNotas(String(d.descricao ?? "")).slice(0, 4000),
    resumo: d.replay ?? {},
    nome: String(anexo?.nome ?? `${id}.rrf`).slice(0, 200),
    tamanho: Number(anexo?.tamanho ?? 0),
    estado,
    origem: `issues/${id}`,
    ...(d.autor ? { nick: String(d.autor).slice(0, 40) } : {}),
    ...(privado?.contato ? { contato: String(privado.contato).slice(0, 120) } : {}),
    // O que a triagem tinha anotado virou comentário na ficha; aqui volta a ser
    // uma anotação privada, que é o que sempre foi.
    ...(comentarios[0]?.d?.texto
      ? { notaTriagem: String(comentarios[0].d.texto).slice(0, 4000) }
      : {}),
  };

  const fields = encodeFields(gravacao);
  fields.criadoEm = { timestampValue: d.criadoEm ?? new Date().toISOString() };
  if (estado !== "fila") {
    fields.decididaEm = { timestampValue: d.atualizadoEm ?? d.criadoEm ?? new Date().toISOString() };
  }

  const res = await fetch(`${url}/gravacoes/${id}?currentDocument.exists=false`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const corpo = await res.text();
    // Já movida numa execução anterior: o card de origem é que ficou para trás.
    if (res.status !== 409 && !/already exists/i.test(corpo)) {
      erros++;
      console.error(`erro em ${id}: ${corpo.slice(0, 200)}`);
      continue;
    }
    puladas++;
  } else {
    movidas++;
  }

  if (anexo?.bytes) {
    const a = await fetch(`${url}/gravacoes/${id}/arquivo/rrf`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({
        fields: {
          nome: { stringValue: String(anexo.nome ?? `${id}.rrf`).slice(0, 200) },
          tipo: { stringValue: "rrf" },
          tamanho: { integerValue: String(anexo.tamanho ?? 0) },
          bytes: { bytesValue: anexo.bytes },
          criadoEm: { timestampValue: d.criadoEm ?? new Date().toISOString() },
        },
      }),
    });
    if (!a.ok) {
      erros++;
      console.error(`arquivo de ${id}: ${(await a.text()).slice(0, 160)}`);
      // Sem o .rrf a gravação não serve para nada, e apagar o card levaria o
      // arquivo junto — então este id fica nos dois lugares até alguém olhar.
      continue;
    }
  }

  // Só agora o card sai do quadro. Subcoleção não some com o pai, por isso cada
  // uma é apagada na mão — e o anexo é justamente o documento pesado.
  for (const c of comentarios) await apagar(`issues/${id}/comentarios/${c.id}`);
  for (const p of await listar(`issues/${id}/privado`)) await apagar(`issues/${id}/privado/${p.id}`);
  for (const an of await listar(`issues/${id}/anexos`)) await apagar(`issues/${id}/anexos/${an.id}`);
  await apagar(`issues/${id}`);
}

if (!dryRun) console.log(`movidas: ${movidas} · já estavam lá: ${puladas} · erros: ${erros}`);
