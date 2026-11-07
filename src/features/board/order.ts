import type { Issue, Position } from "../../lib/issues";

/**
 * The arithmetic of the board's manual order, with no Firestore at all.
 *
 * The model is WYSIWYG and deliberately so: dropping a card anywhere **pins
 * the whole stack** exactly as it ended up on screen, numbered from 0 down.
 * The alternative -- pinning only the dragged card and letting the rest keep
 * flowing by votes -- cannot hold it between neighbours that have no number,
 * and the card wanders off on its own the moment somebody votes.
 *
 * The price is that the stack stops responding to votes after the first drag.
 * That is why the column gets a button to go back to automatic order.
 */

/** Numbers the stack from 0 down, returning only what actually changed. */
function numberStack(stack: Issue[]): Position[] {
  const writes: Position[] = [];
  stack.forEach((issue, i) => {
    if (issue.order !== i) writes.push({ id: issue.id, order: i });
  });
  return writes;
}

/**
 * Drops `dragged` immediately before (or after) `targetId` inside `stack`, and
 * returns the writes that record it.
 *
 * `dragged` comes separately because it may be arriving from another column,
 * in which case it is not in the destination stack.
 */
export function reorderStack(
  stack: Issue[],
  dragged: Issue,
  targetId: string,
  before: boolean,
): Position[] {
  if (dragged.id === targetId) return [];
  const rest = stack.filter((i) => i.id !== dragged.id);
  const destination = rest.findIndex((i) => i.id === targetId);
  if (destination < 0) return [];
  rest.splice(before ? destination : destination + 1, 0, dragged);
  return numberStack(rest);
}

/** Returns the stack to the automatic flow: clears the number from whoever has one. */
export function releaseStack(stack: Issue[]): Position[] {
  return stack.filter((i) => i.order !== null).map((i) => ({ id: i.id, order: null }));
}
