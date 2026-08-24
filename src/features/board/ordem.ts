import type { Issue, Posicao } from "../../lib/issues";

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
function numerar(pilha: Issue[]): Posicao[] {
  const escritas: Posicao[] = [];
  pilha.forEach((issue, i) => {
    if (issue.ordem !== i) escritas.push({ id: issue.id, ordem: i });
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
export function reordenarPilha(
  pilha: Issue[],
  arrastado: Issue,
  alvoId: string,
  antes: boolean,
): Posicao[] {
  if (arrastado.id === alvoId) return [];
  const resto = pilha.filter((i) => i.id !== arrastado.id);
  const destino = resto.findIndex((i) => i.id === alvoId);
  if (destino < 0) return [];
  resto.splice(antes ? destino : destino + 1, 0, arrastado);
  return numerar(resto);
}

/** Devolve a pilha ao fluxo automático: apaga o número de quem tem um. */
export function soltarPilha(pilha: Issue[]): Posicao[] {
  return pilha.filter((i) => i.ordem !== null).map((i) => ({ id: i.id, ordem: null }));
}
