#!/usr/bin/env node
// Builds data/seed-issues.json from the three old sources of issues:
//
//   simulador -> Google Sheets (Form responses)
//   visuais   -> Google Sheets (Form responses)
//   recap     -> the `suggestions` collection in the ragreplaystats Firestore
//
// Runs exactly once, at the migration. The generated JSON is reviewed by hand
// (the titles come out of a heuristic) and becomes the source of truth -- after
// that nobody needs the spreadsheets any more, and this script stands as
// documentation of where the data came from.
//
// The keys it writes are data/seed-issues.json's own and are spelled the way
// they are stored; `--saida` still works beside `--out` because that is what
// the README says to type.
//
//   node tools/import-spreadsheets.mjs [--out data/seed-issues.json]

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SHEETS = {
  simulador: "1mWGbu4CpMYPnPfipjNfmD37u7xutvurPd_CeE-O67vw",
  visuais: "1IcN9IjWbZvfSZwiI2ginxx4J5g_AxhCNkh8f7pdaXZ4",
};

const RECAP = {
  project: "ragreplaystats",
  key: "AIzaSyBqceBTU2JscflNsx8L0pNJJpNhJMgqOSE",
};

const outputPath = (() => {
  for (const flag of ["--out", "--saida"]) {
    const i = process.argv.indexOf(flag);
    if (i > -1) return process.argv[i + 1];
  }
  return "data/seed-issues.json";
})();

// --- CSV -------------------------------------------------------------------

/** A CSV parser that handles quotes and newlines inside a field. */
function parseCSV(text) {
  const rows = [];
  let fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
        } else inQuotes = false;
      } else current += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      fields.push(current);
      current = "";
    } else if (c === "\n") {
      fields.push(current);
      rows.push(fields);
      fields = [];
      current = "";
    } else if (c !== "\r") current += c;
  }
  if (current || fields.length) {
    fields.push(current);
    rows.push(fields);
  }
  return rows;
}

async function downloadSheet(id) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`sheet ${id}: HTTP ${r.status}`);
  return parseCSV(await r.text());
}

// --- Helpers ---------------------------------------------------------------

/** "16/06/2026 08:31:10" in São Paulo time -> ISO in UTC. */
function sheetDate(value) {
  const m = String(value).match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!m) return new Date("2026-06-01T12:00:00Z").toISOString();
  const [, day, month, year, h, min, s] = m;
  return new Date(`${year}-${month}-${day}T${h}:${min}:${s}-03:00`).toISOString();
}

function slug(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Generic titles the spreadsheet accepted that say nothing on their own. */
const USELESS_TITLES = new Set([
  "n/a",
  "na",
  "sugestao",
  "sugestão",
  "todos",
  "todas",
  "alguns",
  "algumas",
  "outros",
  "a calculadora em si",
]);

function firstSentence(text, max = 90) {
  const tidy = text.replace(/\s+/g, " ").trim();
  const cut = tidy.slice(0, max);
  return cut.length < tidy.length ? `${cut.replace(/[\s,;.]+\S*$/, "")}…` : cut;
}

function deriveTitle(subject, description) {
  const a = subject.replace(/\s+/g, " ").trim();
  if (a && a.length > 3 && !USELESS_TITLES.has(a.toLowerCase())) {
    return a.slice(0, 120);
  }
  return firstSentence(description || a || "Sem descrição", 110) || "Sem título";
}

const SUGGESTION_HINTS = [
  "sugest",
  "seria legal",
  "seria interessante",
  "poderia ter",
  "podia ter",
  "poderiam",
  "adicionar",
  "acrescentar",
  "fica a sugest",
  "gostaria que",
  "exibir o tempo",
];

function deriveType(text) {
  const t = text.toLowerCase();
  return SUGGESTION_HINTS.some((p) => t.includes(p)) ? "feature" : "bug";
}

function clean(v) {
  return String(v ?? "").trim();
}

// --- The sources -----------------------------------------------------------

async function fromSimuladorSheet() {
  const rows = (await downloadSheet(SHEETS.simulador)).slice(1);
  const items = [];

  rows.forEach((row, i) => {
    if (!row.some((c) => clean(c))) return;
    const [stamp, subject, description, contact, rawStatus] = row.map(clean);

    const state = rawStatus.toLowerCase();
    let column = "reportado";
    let note = null;
    if (state.startsWith("resolvido parcialmente")) {
      // The spreadsheet's one half-resolved row. It becomes backlog and the
      // original remark goes in as a comment, or the information is lost.
      // `note` keeps the spreadsheet's own wording, not the column we derived.
      column = "backlog";
      note = rawStatus;
    } else if (state === "resolvido") {
      column = "resolvido";
    }

    items.push({
      projeto: "simulador",
      tipo: deriveType(`${subject} ${description}`),
      titulo: deriveTitle(subject, description),
      description,
      status: column,
      criadoEm: sheetDate(stamp),
      contact: contact || null,
      note,
      origem: `sheet:${SHEETS.simulador}#linha${i + 2}`,
    });
  });

  return items;
}

async function fromVisuaisSheet() {
  const rows = (await downloadSheet(SHEETS.visuais)).slice(1);
  const items = [];

  rows.forEach((row, i) => {
    if (!row.some((c) => clean(c))) return;
    const stamp = clean(row[0]);
    const what = clean(row[1]);
    const bug = clean(row[2]);
    const expected = clean(row[3]);
    const build = clean(row[4]);
    const suggestion = clean(row[8]);
    const nick = clean(row[9]);
    const progress = clean(row[10]);

    const body = bug || suggestion;
    // The spreadsheet spreads the report across four columns; the card joins
    // it into one text, in the order the person filled it in.
    const parts = [body];
    if (expected) parts.push(`Esperado: ${expected}`);
    if (build) parts.push(`Build: ${build}`);

    items.push({
      projeto: "visuais",
      tipo: what.toLowerCase().includes("sugest") || suggestion ? "feature" : "bug",
      titulo: deriveTitle("", body),
      description: parts.filter(Boolean).join("\n\n"),
      status: progress.toLowerCase().startsWith("conclu") ? "resolvido" : "reportado",
      criadoEm: sheetDate(stamp),
      contact: nick || null,
      note: null,
      origem: `sheet:${SHEETS.visuais}#linha${i + 2}`,
    });
  });

  return items;
}

async function fromRecapFirestore() {
  const url =
    `https://firestore.googleapis.com/v1/projects/${RECAP.project}` +
    `/databases/(default)/documents:runQuery?key=${RECAP.key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "suggestions" }],
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: 200,
      },
    }),
  });
  if (!r.ok) throw new Error(`recap: HTTP ${r.status}`);

  const rows = (await r.json()).filter((x) => x.document);
  return rows
    .map((x) => {
      const fields = x.document.fields ?? {};
      const text = fields.text?.stringValue ?? "";
      const docId = x.document.name.split("/").pop();
      return {
        projeto: "recap",
        tipo: deriveType(text),
        titulo: deriveTitle("", text),
        description: text,
        status: "reportado",
        criadoEm: fields.createdAt?.timestampValue ?? new Date().toISOString(),
        contact: null,
        note: null,
        origem: `recap:suggestions/${docId}`,
        _upvotes: Number(fields.upvotes?.integerValue ?? 0),
      };
    })
    // "Testando" is the owner's own test row. It does not go in.
    .filter((i) => i.description.trim().toLowerCase() !== "testando");
}

// --- The hand review -------------------------------------------------------

// The spreadsheets had no title field: the form asked "qual item tem o
// problema?" and some people answered "n/A" or pasted the whole report. The
// heuristic above guesses a title; this table is the human reading of each row,
// done once at the migration.
//
// Keyed by ORIGIN, not by title -- so rewriting a title here does not change
// the card's id (the id comes from the reviewed title, and new rows always
// arrive at the end of the spreadsheet, so the old numbering does not move).
//
// The three keys are the ones the assembly below copies onto an item, so they
// are the stored spellings:
//
//   titulo    — what shows on the board
//   tipo      — corrects the bug/suggestion guess
//   arquivado — a duplicate or noise: gone from the public board, but not lost
const SIM = "sheet:1mWGbu4CpMYPnPfipjNfmD37u7xutvurPd_CeE-O67vw";
const VIS = "sheet:1IcN9IjWbZvfSZwiI2ginxx4J5g_AxhCNkh8f7pdaXZ4";

const REVIEW = {
  [`${SIM}#linha2`]: { titulo: "Nome da skill não indica a variação (Adoramus sagrado/neutro)" },
  [`${SIM}#linha3`]: { titulo: "Seção com o gap de pós-conjuração e ASPD" },
  [`${SIM}#linha4`]: {
    titulo: "PR #1 aberta como draft (contribuição)",
    arquivado: true, // recado sobre uma PR, não é um item de quadro
  },
  [`${SIM}#linha5`]: { titulo: "Bônus percentuais aparecem sem o % na descrição do item" },
  [`${SIM}#linha6`]: { titulo: "Arcebispo aparece como Chame de Hela" },
  [`${SIM}#linha7`]: { titulo: "Faltam os encantamentos B- nos itens Automatron" },
  [`${SIM}#linha8`]: {
    titulo: "Faltam Oratio nos buffs, comparação de escudos e ativação na comparação",
  },
  [`${SIM}#linha9`]: { titulo: "Pós-conjuração do Tiro Crescente está 0,3s em vez de 0,5s" },
  [`${SIM}#linha10`]: { titulo: "Exoesqueleto Crítico sem bônus de conjunto com a Jetpack" },
  [`${SIM}#linha11`]: { titulo: "Escudo Sombrio de Sigrun não faz combo com a Malha" },
  [`${SIM}#linha12`]: { titulo: "Faltam a Bala de Guaraná e o Aumentar Agilidade 5" },
  [`${SIM}#linha13`]: { titulo: "Tooltip com os status do item ou carta ao passar o mouse" },
  [`${SIM}#linha14`]: { titulo: "Falta o buff Têmpera do Dieter (Cientista)" },
  [`${SIM}#linha15`]: {
    titulo: "Equipamentos de cerco, máscaras com slot e encantos do Lobo Cinzento",
    tipo: "bug",
  },
  [`${SIM}#linha16`]: { titulo: "Mostrar o tempo para matar com base no DPS" },
  [`${SIM}#linha17`]: { titulo: "Adicionar o Asceta" },
  [`${SIM}#linha18`]: { titulo: "Combo do Diadema Radiante não está entrando" },
  [`${SIM}#linha19`]: { titulo: "Escudos Purificado e Sanguinário não recebem bônus aleatórios" },
  [`${SIM}#linha20`]: { titulo: "Dano do ataque básico com Mergulho Aéreo (build de falcão)" },
  [`${SIM}#linha21`]: {
    titulo: "Set Sombrio da Guarda Imperial não computa o bypass por refino e nível",
  },
  [`${SIM}#linha22`]: { titulo: "Monstros de Amicitia 2 com HP muito abaixo do real" },
  [`${SIM}#linha23`]: { titulo: "Faltam Impacto Espiritual e Telecinesia no Superaprendiz" },
  [`${SIM}#linha24`]: {
    titulo: "Faltam Impacto Espiritual e Telecinesia no Superaprendiz (repetido)",
    arquivado: true, // mesmo relato da linha 23, enviado por outra pessoa
  },
  [`${SIM}#linha25`]: { titulo: "Reduções de tempo de cast não aparecem na comparação de itens" },
  [`${SIM}#linha26`]: { titulo: "Set Goibne Ilusional não soma os itens do combo" },
  [`${SIM}#linha27`]: { titulo: "Armas nível 5 e armaduras nível 2 sem opção de grade" },
  [`${SIM}#linha28`]: { titulo: "Encantos do Passe de Batalha com descrição incorreta" },
  [`${SIM}#linha29`]: { titulo: "Carta Gerente (4229) não aparece na lista" },
  [`${SIM}#linha30`]: { titulo: "Ult do Superaprendiz (Anjo da Magia) não aparece nos buffs" },
  [`${SIM}#linha31`]: { titulo: "Escudo Automatron B não ignora DEFM conforme o refino" },
  [`${SIM}#linha32`]: { titulo: "Recarga do Canhão do Mecânico está 0,3s em vez de 0,15s" },
  [`${SIM}#linha33`]: {
    titulo: "Conjunto Cajado + Elmo de Cinzas não aplica o bônus por refino",
  },
  [`${SIM}#linha34`]: { titulo: "Elmo da Fé Mortal 2 dá mais dano que o 1" },
  [`${SIM}#linha35`]: { titulo: "Personalizar status manualmente e cartas faltando" },
  [`${SIM}#linha36`]: { titulo: "Falta a skill Firmamento do Mestre Celestial" },
  [`${SIM}#linha37`]: {
    titulo: "Combo Cavaleiro Branco + Khalitzburg só reduz dano de monstros médios",
  },
  [`${SIM}#linha38`]: {
    titulo: "Adicionar a habilidade Firmamento (repetido)",
    arquivado: true, // mesmo pedido da linha 36
  },
  [`${SIM}#linha39`]: { titulo: "Escudo Automatron sem opções de encantamento" },
  [`${SIM}#linha40`]: {
    titulo: "Antiatraso na Turbina Ilusional infla o dano do Guerrilheiro",
  },
  [`${SIM}#linha41`]: { titulo: "Falta o Anel do Mecânico" },
  [`${SIM}#linha42`]: { titulo: "Centelha das Trevas (Shiranui) conta o dano crítico inteiro" },
  [`${SIM}#linha43`]: { titulo: "Falta o Amuleto do Lobo (491084) físico e mágico" },
  [`${SIM}#linha44`]: { titulo: "Cartas faltando no banco (Marionete Demoníaca, Doppelganger)" },
  [`${SIM}#linha45`]: {
    titulo: "Canhão nível 5 do Mecânico com recarga e pós-conjuração errados",
  },
  [`${SIM}#linha46`]: {
    titulo: "Combo Brasão de Força + Cachecol não anula a penalidade de tamanho",
  },
  [`${SIM}#linha47`]: { titulo: "Cachecol Físico de Schmidt não mostra os efeitos do conjunto" },
  [`${SIM}#linha48`]: { titulo: "Falta a skill Bloqueio no Hyper Aprendiz" },
  [`${SIM}#linha49`]: { titulo: "Escudo e Bota Excelion sem pós-conjuração e sem diagramas" },
  [`${SIM}#linha50`]: { titulo: "Amuleto Oriental/Ocidental não aparece para o Invocador" },
  [`${SIM}#linha51`]: { titulo: "Encantamentos do Sapato Corredor Ilusional incompletos" },
  [`${SIM}#linha52`]: { titulo: "Carta Mosca Caçadora não aparece na lista de armas" },
  [`${SIM}#linha53`]: { titulo: "Simular dano de auto-attack do Cavaleiro Rúnico" },
  [`${SIM}#linha54`]: { titulo: "Runa Othila aumenta a ASPD de forma irreal" },
  [`${SIM}#linha55`]: { titulo: "Escudo Excelion não aplica efeitos nem permite escolher módulos" },

  [`${VIS}#linha2`]: { titulo: "Salvar mais de um conjunto de visuais" },
  [`${VIS}#linha3`]: { titulo: "Site sempre volta para o primeiro personagem simulado" },
  [`${VIS}#linha4`]: { titulo: "Capa Asas Esvoaçantes de Arcanjo na posição errada" },
  [`${VIS}#linha5`]: {
    titulo: "Capa Asas Esvoaçantes de Arcanjo aparece na cabeça (repetido)",
    arquivado: true, // mesmo bug da linha 4
  },
  [`${VIS}#linha6`]: { titulo: "Falta o botão de roupa alternativa das classes" },

  "recap:suggestions/yA5M1ICTzJCcHX3YN74R": {
    titulo: "Dano inicial da Zona Gravitacional não é contabilizado",
  },
  "recap:suggestions/68ruD2BvE1XLPOCH1rwL": {
    titulo: "Falta a classe Ceifador de Almas",
    tipo: "feature",
  },
  "recap:suggestions/EkgtbHcqJbaoaxlyJSXY": {
    titulo: "Dano dos elementais de Elementalista não aparece",
  },
};

// --- Assembly --------------------------------------------------------------

const raw = [...(await fromSimuladorSheet()), ...(await fromVisuaisSheet()), ...(await fromRecapFirestore())];

let unreviewed = 0;
for (const item of raw) {
  const r = REVIEW[item.origem];
  if (!r) {
    // A new row, arrived after the migration: it goes in with the
    // heuristic's title.
    unreviewed++;
    continue;
  }
  if (r.titulo) item.titulo = r.titulo;
  if (r.tipo) item.tipo = r.tipo;
  if (r.arquivado) item.arquivado = true;
}
if (unreviewed) console.warn(`warning: ${unreviewed} row(s) with no hand review`);

const used = new Map();
const items = raw.map((i) => {
  const base = `${i.projeto}-${slug(i.titulo)}`;
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);

  return {
    // A deterministic, readable id: re-importing does not duplicate, and
    // editing the title later (in the hand review) does not change the id.
    id: n === 1 ? base : `${base}-${n}`,
    // Every key below is data/seed-issues.json's own, which tools/seed.mjs
    // reads and writes straight into Firestore -- so they are spelled the way
    // they are stored, and written out in full rather than by shorthand.
    projeto: i.projeto,
    tipo: i.tipo,
    titulo: i.titulo,
    descricao: i.description,
    status: i.status,
    arquivado: i.arquivado === true,
    upvotes: i._upvotes ?? 0,
    criadoEm: i.criadoEm,
    // Nothing anywhere records when a resolved item was resolved; using the
    // creation date keeps the relative order, which is what the column needs.
    atualizadoEm: i.criadoEm,
    origem: i.origem,
    ...(i.contact ? { contato: i.contact } : {}),
    ...(i.note ? { nota: i.note } : {}),
  };
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");

const byProject = {};
const byStatus = {};
for (const i of items) {
  byProject[i.projeto] = (byProject[i.projeto] ?? 0) + 1;
  byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
}
console.log(`${items.length} items -> ${outputPath}`);
console.log("by project:", byProject);
console.log("by status: ", byStatus);
