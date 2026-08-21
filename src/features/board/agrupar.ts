import type { Issue } from "../../lib/issues";
import type { Projeto } from "../../lib/projetos";
import type { Coluna, Status, Tipo } from "../../lib/status";
import { COLUNAS, ordenaPorAtualizacao } from "../../lib/status";

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

function comparar(a: Issue, b: Issue, status: Status): number {
  if (ordenaPorAtualizacao(status)) {
    // Colunas de encerramento: o que saiu mais recentemente vem primeiro.
    return tempo(b.atualizadoEm) - tempo(a.atualizadoEm);
  }
  // Resto do quadro: mais votado primeiro, empate desempatado pelo mais novo.
  if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
  return tempo(b.criadoEm) - tempo(a.criadoEm);
}

export type Agrupado = { coluna: Coluna; issues: Issue[] };

/**
 * Filtra, agrupa por status e ordena. Função pura de propósito — é a única parte
 * do quadro que dá para testar sem Firestore, e é onde mora toda a lógica.
 */
export function agrupar(issues: Issue[], filtros: Filtros): Agrupado[] {
  const visiveis = filtrar(issues, filtros).filter((i) => !i.arquivado);
  return COLUNAS.map((coluna) => ({
    coluna: coluna as Coluna,
    issues: visiveis.filter((i) => i.status === coluna).sort((a, b) => comparar(a, b, coluna)),
  }));
}

/** Igual ao `agrupar`, mais a gaveta de arquivados no fim. Só com sessão. */
export function agruparAdmin(issues: Issue[], filtros: Filtros): Agrupado[] {
  const todos = filtrar(issues, filtros);
  const ativos = todos.filter((i) => !i.arquivado);
  const colunas: Agrupado[] = COLUNAS.map((coluna) => ({
    coluna: coluna as Coluna,
    issues: ativos.filter((i) => i.status === coluna).sort((a, b) => comparar(a, b, coluna)),
  }));
  colunas.push({
    coluna: "arquivado",
    issues: todos
      .filter((i) => i.arquivado)
      .sort((a, b) => tempo(b.atualizadoEm) - tempo(a.atualizadoEm)),
  });
  return colunas;
}
