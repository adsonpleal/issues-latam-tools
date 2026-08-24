import type { Issue } from "../../lib/issues";
import type { Projeto } from "../../lib/projetos";
import type { Coluna, Tipo } from "../../lib/status";
import { COLUNAS, COLUNAS_ADMIN, ordenaPorAtualizacao } from "../../lib/status";

export type Filtros = {
  projeto: Projeto | null;
  tipo: Tipo | null;
  busca: string;
};

export const FILTROS_VAZIOS: Filtros = { projeto: null, tipo: null, busca: "" };

/** Sem acento e em minúsculas, para "gravitacional" achar "Gravitacional". */
function normaliza(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function filtrar(issues: Issue[], filtros: Filtros): Issue[] {
  const termo = normaliza(filtros.busca.trim());
  return issues.filter((i) => {
    if (filtros.projeto && i.projeto !== filtros.projeto) return false;
    if (filtros.tipo && i.tipo !== filtros.tipo) return false;
    if (termo && !normaliza(`${i.titulo} ${i.descricao}`).includes(termo)) return false;
    return true;
  });
}

function tempo(d: Date | null): number {
  return d ? d.getTime() : 0;
}

/**
 * A coluna onde o card aparece. `arquivado` não é status: é o booleano que tira
 * o card das cinco colunas e o joga na gaveta.
 */
export function colunaDe(issue: Issue): Coluna {
  return issue.arquivado ? "arquivado" : issue.status;
}

function comparar(a: Issue, b: Issue, coluna: Coluna): number {
  // Arrumado à mão manda em tudo. Quem não foi arrumado flui embaixo, pela
  // regra da coluna — é o que faz um card novo cair no fim de uma pilha
  // arrumada em vez de se enfiar no meio dela.
  if (a.ordem !== null || b.ordem !== null) {
    if (a.ordem === null) return 1;
    if (b.ordem === null) return -1;
    if (a.ordem !== b.ordem) return a.ordem - b.ordem;
  }
  if (ordenaPorAtualizacao(coluna)) {
    // Colunas de encerramento: o que saiu mais recentemente vem primeiro.
    return tempo(b.atualizadoEm) - tempo(a.atualizadoEm);
  }
  // Resto do quadro: mais votado primeiro, empate desempatado pelo mais novo.
  if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
  return tempo(b.criadoEm) - tempo(a.criadoEm);
}

export type Agrupado = { coluna: Coluna; issues: Issue[] };

/**
 * A pilha de uma coluna, na ordem da tela.
 *
 * O agrupamento passa a lista já filtrada; quem vai **gravar** ordem passa a
 * lista inteira, sem filtro. Isso não é detalhe: arrastar com um filtro ligado
 * não pode embaralhar o que o filtro está escondendo. Como a pilha completa
 * preserva a posição relativa dos escondidos, "soltar antes do card X" quer
 * dizer a mesma coisa nas duas.
 */
export function pilha(issues: Issue[], coluna: Coluna): Issue[] {
  return issues.filter((i) => colunaDe(i) === coluna).sort((a, b) => comparar(a, b, coluna));
}

/**
 * Filtra, agrupa por status e ordena. Função pura de propósito — é a única parte
 * do quadro que dá para testar sem Firestore, e é onde mora toda a lógica.
 */
export function agrupar(issues: Issue[], filtros: Filtros): Agrupado[] {
  const visiveis = filtrar(issues, filtros);
  return COLUNAS.map((coluna) => ({
    coluna: coluna as Coluna,
    issues: pilha(visiveis, coluna),
  }));
}

/** Igual ao `agrupar`, mais a gaveta de arquivados no fim. Só com sessão. */
export function agruparAdmin(issues: Issue[], filtros: Filtros): Agrupado[] {
  const visiveis = filtrar(issues, filtros);
  return COLUNAS_ADMIN.map((coluna) => ({ coluna, issues: pilha(visiveis, coluna) }));
}
