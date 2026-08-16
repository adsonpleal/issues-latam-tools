/**
 * As cinco colunas públicas, na ordem do quadro.
 *
 * `arquivado` NÃO é status: é um booleano separado no documento. Isso é o que
 * permite a regra de segurança esconder card arquivado (ver firestore.rules), e
 * é o que faz desarquivar devolver o card para `resolvido` em vez de jogá-lo de
 * volta em `reportado`.
 */
export const COLUNAS = [
  "reportado",
  "backlog",
  "em_progresso",
  "resolvido",
  "nao_sera_feito",
] as const;

export type Status = (typeof COLUNAS)[number];

/** Coluna do quadro do admin: as cinco de status + a gaveta de arquivados. */
export type Coluna = Status | "arquivado";

export const COLUNAS_ADMIN: Coluna[] = [...COLUNAS, "arquivado"];

export const TIPOS = ["bug", "feature"] as const;
export type Tipo = (typeof TIPOS)[number];

export function isStatus(valor: unknown): valor is Status {
  return typeof valor === "string" && (COLUNAS as readonly string[]).includes(valor);
}

export function isTipo(valor: unknown): valor is Tipo {
  return typeof valor === "string" && (TIPOS as readonly string[]).includes(valor);
}

/**
 * Colunas de encerramento ordenam pela última mexida, não pelos votos: o que
 * interessa ali é "o que saiu agora", e não "o que foi mais pedido".
 */
export function ordenaPorAtualizacao(status: Status): boolean {
  return status === "resolvido" || status === "nao_sera_feito";
}
