#!/usr/bin/env node
// Gera data/seed-issues.json a partir das três origens antigas de issue:
//
//   simulador -> Google Sheets (respostas do Form)
//   visuais   -> Google Sheets (respostas do Form)
//   recap     -> coleção `suggestions` no Firestore do projeto ragreplaystats
//
// Roda uma vez só, na migração. O JSON gerado é revisado à mão (os títulos
// saem de heurística) e vira a fonte da verdade — depois disso ninguém precisa
// mais das planilhas, e este script fica de documentação de procedência.
//
//   node tools/importar-planilhas.mjs [--saida data/seed-issues.json]

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PLANILHAS = {
  simulador: "1mWGbu4CpMYPnPfipjNfmD37u7xutvurPd_CeE-O67vw",
  visuais: "1IcN9IjWbZvfSZwiI2ginxx4J5g_AxhCNkh8f7pdaXZ4",
};

const RECAP = {
  projeto: "ragreplaystats",
  chave: "AIzaSyBqceBTU2JscflNsx8L0pNJJpNhJMgqOSE",
};

const saida = (() => {
  const i = process.argv.indexOf("--saida");
  return i > -1 ? process.argv[i + 1] : "data/seed-issues.json";
})();

// --- CSV -------------------------------------------------------------------

/** Parser de CSV com aspas e quebra de linha dentro do campo. */
function parseCSV(texto) {
  const linhas = [];
  let campos = [];
  let atual = "";
  let aspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          atual += '"';
          i++;
        } else aspas = false;
      } else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") {
      campos.push(atual);
      atual = "";
    } else if (c === "\n") {
      campos.push(atual);
      linhas.push(campos);
      campos = [];
      atual = "";
    } else if (c !== "\r") atual += c;
  }
  if (atual || campos.length) {
    campos.push(atual);
    linhas.push(campos);
  }
  return linhas;
}

async function baixarPlanilha(id) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`planilha ${id}: HTTP ${r.status}`);
  return parseCSV(await r.text());
}

// --- Utilidades ------------------------------------------------------------

/** "16/06/2026 08:31:10" no fuso de São Paulo -> ISO em UTC. */
function dataPlanilha(bruto) {
  const m = String(bruto).match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!m) return new Date("2026-06-01T12:00:00Z").toISOString();
  const [, dia, mes, ano, h, min, s] = m;
  return new Date(`${ano}-${mes}-${dia}T${h}:${min}:${s}-03:00`).toISOString();
}

function slug(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Títulos genéricos que a planilha aceitou e que não dizem nada sozinhos. */
const TITULOS_INUTEIS = new Set([
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

function primeiraFrase(texto, max = 90) {
  const limpo = texto.replace(/\s+/g, " ").trim();
  const corte = limpo.slice(0, max);
  return corte.length < limpo.length ? `${corte.replace(/[\s,;.]+\S*$/, "")}…` : corte;
}

function derivaTitulo(assunto, descricao) {
  const a = assunto.replace(/\s+/g, " ").trim();
  if (a && a.length > 3 && !TITULOS_INUTEIS.has(a.toLowerCase())) {
    return a.slice(0, 120);
  }
  return primeiraFrase(descricao || a || "Sem descrição", 110) || "Sem título";
}

const PISTAS_SUGESTAO = [
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

function derivaTipo(texto) {
  const t = texto.toLowerCase();
  return PISTAS_SUGESTAO.some((p) => t.includes(p)) ? "feature" : "bug";
}

function limpo(v) {
  return String(v ?? "").trim();
}

// --- Origens ---------------------------------------------------------------

async function doSimulador() {
  const linhas = (await baixarPlanilha(PLANILHAS.simulador)).slice(1);
  const itens = [];

  linhas.forEach((linha, i) => {
    if (!linha.some((c) => limpo(c))) return;
    const [carimbo, assunto, descricao, contato, status] = linha.map(limpo);

    const situacao = status.toLowerCase();
    let novoStatus = "reportado";
    let nota = null;
    if (situacao.startsWith("resolvido parcialmente")) {
      // A única linha meio-resolvida da planilha. Vira backlog e a observação
      // original entra como comentário, senão a informação se perde.
      novoStatus = "backlog";
      nota = status;
    } else if (situacao === "resolvido") {
      novoStatus = "resolvido";
    }

    itens.push({
      projeto: "simulador",
      tipo: derivaTipo(`${assunto} ${descricao}`),
      titulo: derivaTitulo(assunto, descricao),
      descricao,
      status: novoStatus,
      criadoEm: dataPlanilha(carimbo),
      contato: contato || null,
      nota,
      origem: `sheet:${PLANILHAS.simulador}#linha${i + 2}`,
    });
  });

  return itens;
}

async function doVisuais() {
  const linhas = (await baixarPlanilha(PLANILHAS.visuais)).slice(1);
  const itens = [];

  linhas.forEach((linha, i) => {
    if (!linha.some((c) => limpo(c))) return;
    const carimbo = limpo(linha[0]);
    const oQue = limpo(linha[1]);
    const bug = limpo(linha[2]);
    const esperado = limpo(linha[3]);
    const build = limpo(linha[4]);
    const sugestao = limpo(linha[8]);
    const nick = limpo(linha[9]);
    const progresso = limpo(linha[10]);

    const corpo = bug || sugestao;
    // A planilha espalha o relato por quatro colunas; o card junta tudo num
    // texto só, na ordem em que a pessoa preencheu.
    const partes = [corpo];
    if (esperado) partes.push(`Esperado: ${esperado}`);
    if (build) partes.push(`Build: ${build}`);

    itens.push({
      projeto: "visuais",
      tipo: oQue.toLowerCase().includes("sugest") || sugestao ? "feature" : "bug",
      titulo: derivaTitulo("", corpo),
      descricao: partes.filter(Boolean).join("\n\n"),
      status: progresso.toLowerCase().startsWith("conclu") ? "resolvido" : "reportado",
      criadoEm: dataPlanilha(carimbo),
      contato: nick || null,
      nota: null,
      origem: `sheet:${PLANILHAS.visuais}#linha${i + 2}`,
    });
  });

  return itens;
}

async function doRecap() {
  const url =
    `https://firestore.googleapis.com/v1/projects/${RECAP.projeto}` +
    `/databases/(default)/documents:runQuery?key=${RECAP.chave}`;
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

  const linhas = (await r.json()).filter((x) => x.document);
  return linhas
    .map((x) => {
      const campos = x.document.fields ?? {};
      const texto = campos.text?.stringValue ?? "";
      const docId = x.document.name.split("/").pop();
      return {
        projeto: "recap",
        tipo: derivaTipo(texto),
        titulo: derivaTitulo("", texto),
        descricao: texto,
        status: "reportado",
        criadoEm: campos.createdAt?.timestampValue ?? new Date().toISOString(),
        contato: null,
        nota: null,
        origem: `recap:suggestions/${docId}`,
        _votos: Number(campos.upvotes?.integerValue ?? 0),
      };
    })
    // "Testando" é linha de teste do próprio dono. Não entra.
    .filter((i) => i.descricao.trim().toLowerCase() !== "testando");
}

// --- Revisão à mão ---------------------------------------------------------

// As planilhas não tinham campo de título: o formulário perguntava "qual item
// tem o problema?" e algumas pessoas respondiam "n/A" ou colavam o relato
// inteiro. A heurística acima chuta um título; esta tabela é a leitura humana
// de cada linha, feita uma vez na migração.
//
// Chaveada pela ORIGEM, não pelo título — assim reescrever o título aqui não
// muda o id do card (o id sai do título já revisado, e linhas novas entram
// sempre no fim da planilha, então a numeração das antigas não anda).
//
//   titulo    — o que aparece no quadro
//   tipo      — corrige o chute de bug/sugestão
//   arquivado — duplicata ou ruído: some do quadro público, mas não se perde
const SIM = "sheet:1mWGbu4CpMYPnPfipjNfmD37u7xutvurPd_CeE-O67vw";
const VIS = "sheet:1IcN9IjWbZvfSZwiI2ginxx4J5g_AxhCNkh8f7pdaXZ4";

const REVISAO = {
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

// --- Montagem --------------------------------------------------------------

const brutos = [...(await doSimulador()), ...(await doVisuais()), ...(await doRecap())];

let semRevisao = 0;
for (const item of brutos) {
  const r = REVISAO[item.origem];
  if (!r) {
    // Linha nova, chegada depois da migração: entra com o título da heurística.
    semRevisao++;
    continue;
  }
  if (r.titulo) item.titulo = r.titulo;
  if (r.tipo) item.tipo = r.tipo;
  if (r.arquivado) item.arquivado = true;
}
if (semRevisao) console.warn(`aviso: ${semRevisao} linha(s) sem revisão manual`);

const usados = new Map();
const itens = brutos.map((i) => {
  const base = `${i.projeto}-${slug(i.titulo)}`;
  const n = (usados.get(base) ?? 0) + 1;
  usados.set(base, n);

  return {
    // Id determinístico e legível: reimportar não duplica, e editar o título
    // depois (na revisão à mão) não muda o id.
    id: n === 1 ? base : `${base}-${n}`,
    projeto: i.projeto,
    tipo: i.tipo,
    titulo: i.titulo,
    descricao: i.descricao,
    status: i.status,
    arquivado: i.arquivado === true,
    upvotes: i._votos ?? 0,
    criadoEm: i.criadoEm,
    // Quem foi resolvido não tem data de resolução em lugar nenhum; usar a de
    // criação mantém a ordem relativa, que é o que a coluna precisa.
    atualizadoEm: i.criadoEm,
    origem: i.origem,
    ...(i.contato ? { contato: i.contato } : {}),
    ...(i.nota ? { nota: i.nota } : {}),
  };
});

mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, `${JSON.stringify(itens, null, 2)}\n`, "utf8");

const porProjeto = {};
const porStatus = {};
for (const i of itens) {
  porProjeto[i.projeto] = (porProjeto[i.projeto] ?? 0) + 1;
  porStatus[i.status] = (porStatus[i.status] ?? 0) + 1;
}
console.log(`${itens.length} itens -> ${saida}`);
console.log("por projeto:", porProjeto);
console.log("por status: ", porStatus);
