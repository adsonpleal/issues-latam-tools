#!/usr/bin/env node
// Carrega data/seed-issues.json no Firestore. Idempotente: rodar de novo não
// duplica nem desfaz triagem já feita à mão.
//
//   node tools/seed.mjs --dry-run
//   node tools/seed.mjs
//   node tools/seed.mjs --force            # sobrescreve o que já existe
//   node tools/seed.mjs --project outro-id
//
// Fala com a API REST do Firestore em vez do firebase-admin: o SDK admin só
// aceita credencial de service account para Firestore, e a API REST aceita o
// token que o `firebase login` já deixou na máquina. Um passo a menos de setup.
// Escrita autenticada assim passa por cima das regras de segurança — é o único
// caminho que consegue gravar `origem`, por exemplo.

import { readFileSync } from "node:fs";

import { accessToken } from "./credencial.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const projectId = args.includes("--project")
  ? args[args.indexOf("--project") + 1]
  : "issues-latam-tools";

const PROJETOS = ["visuais", "simulador", "recap", "mercado", "calc"];
const STATUSES = ["reportado", "backlog", "em_progresso", "resolvido", "nao_sera_feito"];
const TIPOS = ["bug", "feature"];

const BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// --- Validação -------------------------------------------------------------

function valida(item, i) {
  const erro = (msg) => `item ${i} (${item.id ?? "sem id"}): ${msg}`;

  if (!item.id || typeof item.id !== "string") throw new Error(erro("sem id"));
  if (!PROJETOS.includes(item.projeto)) throw new Error(erro(`projeto inválido: ${item.projeto}`));
  if (!STATUSES.includes(item.status)) throw new Error(erro(`status inválido: ${item.status}`));
  if (!TIPOS.includes(item.tipo)) throw new Error(erro(`tipo inválido: ${item.tipo}`));
  if (typeof item.titulo !== "string" || item.titulo.length < 3 || item.titulo.length > 120) {
    throw new Error(erro(`título fora de 3..120 (${item.titulo?.length})`));
  }
  if (typeof item.descricao !== "string" || item.descricao.length > 4000) {
    throw new Error(erro("descrição ausente ou acima de 4000"));
  }
  // Falha barulhenta de propósito: um único documento sem `arquivado` quebra a
  // consulta do quadro para TODO MUNDO, porque a regra `allow list` avalia
  // `resource.data.arquivado` (ver firestore.rules).
  if (typeof item.arquivado !== "boolean") throw new Error(erro("`arquivado` precisa ser booleano"));
  if (!Number.isInteger(item.upvotes) || item.upvotes < 0) throw new Error(erro("upvotes inválido"));
  if (Number.isNaN(Date.parse(item.criadoEm))) throw new Error(erro("criadoEm inválido"));
}

// --- Codificação REST ------------------------------------------------------

const str = (v) => ({ stringValue: v });
const int = (v) => ({ integerValue: String(v) });
const bool = (v) => ({ booleanValue: v });
const ts = (v) => ({ timestampValue: new Date(v).toISOString() });

// --- Carga -----------------------------------------------------------------

const itens = JSON.parse(readFileSync("data/seed-issues.json", "utf8"));
itens.forEach(valida);

const ids = new Set();
for (const i of itens) {
  if (ids.has(i.id)) throw new Error(`id repetido: ${i.id}`);
  ids.add(i.id);
}

console.log(`${itens.length} itens validados, projeto ${projectId}${dryRun ? " (dry-run)" : ""}`);

if (dryRun) {
  const porStatus = {};
  for (const i of itens) {
    const chave = i.arquivado ? "arquivado" : i.status;
    porStatus[chave] = (porStatus[chave] ?? 0) + 1;
  }
  console.log("distribuição:", porStatus);
  console.log(`comentários a criar: ${itens.filter((i) => i.nota).length}`);
  console.log(`contatos privados a criar: ${itens.filter((i) => i.contato).length}`);
  process.exit(0);
}

const token = await accessToken();
const cabecalhos = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function escreve(caminho, fields, { criarSomente = false } = {}) {
  // `currentDocument.exists=false` é o `create()` do SDK: se o documento já
  // existe, o servidor recusa em vez de sobrescrever. É isso que impede o seed
  // de devolver para `reportado` um card já movido para `em_progresso`.
  const url = `${BASE}/${caminho}${criarSomente ? "?currentDocument.exists=false" : ""}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: cabecalhos,
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) {
    const corpo = await r.text();
    const jaExiste = r.status === 409 || /already exists|ALREADY_EXISTS/i.test(corpo);
    return { ok: false, jaExiste, corpo };
  }
  return { ok: true };
}

let criados = 0;
let pulados = 0;
let erros = 0;

for (const item of itens) {
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

  const r = await escreve(`issues/${item.id}`, doc, { criarSomente: !force });
  if (!r.ok) {
    if (r.jaExiste) {
      pulados++;
      continue;
    }
    erros++;
    console.error(`erro em ${item.id}: ${r.corpo.slice(0, 200)}`);
    continue;
  }
  criados++;

  if (item.contato) {
    // Subdocumento que só o admin lê. Quem preencheu a planilha respondeu um
    // formulário privado e nunca combinou de ter e-mail ou Discord publicados.
    const c = await escreve(`issues/${item.id}/privado/contato`, {
      contato: str(item.contato),
      criadoEm: ts(item.criadoEm),
    });
    if (!c.ok) console.error(`contato de ${item.id}: ${c.corpo.slice(0, 120)}`);
  }

  if (item.nota) {
    const n = await fetch(`${BASE}/issues/${item.id}/comentarios`, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({
        fields: {
          texto: str(item.nota),
          autor: str("Migração"),
          autorUid: str("seed"),
          tipo: str("mudanca"),
          criadoEm: ts(item.criadoEm),
        },
      }),
    });
    if (!n.ok) console.error(`nota de ${item.id}: ${(await n.text()).slice(0, 120)}`);
  }
}

console.log(`criados: ${criados} · pulados: ${pulados} · erros: ${erros}`);
process.exit(erros > 0 ? 1 : 0);
