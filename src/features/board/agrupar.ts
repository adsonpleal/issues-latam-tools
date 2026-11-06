import type { Issue } from "../../lib/issues";
import type { Project } from "../../lib/projetos";
import type { Column, IssueType } from "../../lib/status";
import { COLUMNS, ADMIN_COLUMNS, sortsByUpdatedAt } from "../../lib/status";

export type Filtros = {
  project: Project | null;
  type: IssueType | null;
  busca: string;
};

export const FILTROS_VAZIOS: Filtros = { project: null, type: null, busca: "" };

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
    if (filtros.project && i.project !== filtros.project) return false;
    if (filtros.type && i.type !== filtros.type) return false;
    if (termo && !normaliza(`${i.title} ${i.description}`).includes(termo)) return false;
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
export function colunaDe(issue: Issue): Column {
  return issue.archived ? "arquivado" : issue.status;
}

function comparar(a: Issue, b: Issue, column: Column): number {
  // Arrumado à mão manda em tudo. Quem não foi arrumado flui embaixo, pela
  // regra da coluna — é o que faz um card novo cair no fim de uma pilha
  // arrumada em vez de se enfiar no meio dela.
  if (a.order !== null || b.order !== null) {
    if (a.order === null) return 1;
    if (b.order === null) return -1;
    if (a.order !== b.order) return a.order - b.order;
  }
  if (sortsByUpdatedAt(column)) {
    // Colunas de encerramento: o que saiu mais recentemente vem primeiro.
    return tempo(b.updatedAt) - tempo(a.updatedAt);
  }
  // Resto do quadro: mais votado primeiro, empate desempatado pelo mais novo.
  if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
  return tempo(b.createdAt) - tempo(a.createdAt);
}

export type Agrupado = { column: Column; issues: Issue[] };

/**
 * A pilha de uma coluna, na ordem da tela.
 *
 * O agrupamento passa a lista já filtrada; quem vai **gravar** ordem passa a
 * lista inteira, sem filtro. Isso não é detalhe: arrastar com um filtro ligado
 * não pode embaralhar o que o filtro está escondendo. Como a pilha completa
 * preserva a posição relativa dos escondidos, "soltar antes do card X" quer
 * dizer a mesma coisa nas duas.
 */
export function pilha(issues: Issue[], column: Column): Issue[] {
  return issues.filter((i) => colunaDe(i) === column).sort((a, b) => comparar(a, b, column));
}

/**
 * Filtra, agrupa por status e ordena. Função pura de propósito — é a única parte
 * do quadro que dá para testar sem Firestore, e é onde mora toda a lógica.
 */
export function agrupar(issues: Issue[], filtros: Filtros): Agrupado[] {
  const visiveis = filtrar(issues, filtros);
  return COLUMNS.map((column) => ({
    column: column as Column,
    issues: pilha(visiveis, column),
  }));
}

/** Igual ao `agrupar`, mais a gaveta de arquivados no fim. Só com sessão. */
export function agruparAdmin(issues: Issue[], filtros: Filtros): Agrupado[] {
  const visiveis = filtrar(issues, filtros);
  return ADMIN_COLUMNS.map((column) => ({ column, issues: pilha(visiveis, column) }));
}
