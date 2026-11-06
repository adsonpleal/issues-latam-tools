import type { Issue, Position } from "../../lib/issues";

/**
 * A conta da ordem manual do quadro, sem Firestore nenhum.
 *
 * O modelo é WYSIWYG e de propósito: soltar um card em qualquer posição **fixa
 * a pilha inteira** do jeito que ela ficou na tela, numerada de 0 para baixo.
 * A alternativa — prender só o card arrastado e deixar o resto fluindo por
 * votos — não consegue segurá-lo no meio de vizinhos que não têm número, e o
 * card volta sozinho para outro lugar assim que alguém vota.
 *
 * O preço é que a pilha para de responder aos votos depois do primeiro arrasto.
 * É por isso que a coluna ganha o botão de voltar à ordem automática.
 */

/** Numera a pilha de 0 para baixo, devolvendo só o que de fato mudou. */
function numberStack(stack: Issue[]): Position[] {
  const escritas: Position[] = [];
  stack.forEach((issue, i) => {
    if (issue.order !== i) escritas.push({ id: issue.id, order: i });
  });
  return escritas;
}

/**
 * Solta `arrastado` imediatamente antes (ou depois) de `alvoId` dentro de
 * `pilha`, e devolve as escritas que gravam isso.
 *
 * `arrastado` vem à parte porque ele pode estar vindo de outra coluna, e aí não
 * está na pilha de destino.
 */
export function reorderStack(
  stack: Issue[],
  dragged: Issue,
  targetId: string,
  before: boolean,
): Position[] {
  if (dragged.id === targetId) return [];
  const resto = stack.filter((i) => i.id !== dragged.id);
  const destination = resto.findIndex((i) => i.id === targetId);
  if (destination < 0) return [];
  resto.splice(before ? destination : destination + 1, 0, dragged);
  return numberStack(resto);
}

/** Devolve a pilha ao fluxo automático: apaga o número de quem tem um. */
export function releaseStack(stack: Issue[]): Position[] {
  return stack.filter((i) => i.order !== null).map((i) => ({ id: i.id, order: null }));
}
