import { describe, expect, it } from "vitest";

import type { Issue } from "../../lib/issues";
import { reorderStack, releaseStack } from "./ordem";

function issue(id: string, order: number | null = null): Issue {
  return {
    id,
    project: "simulador",
    title: id,
    description: "",
    type: "bug",
    status: "backlog",
    archived: false,
    upvotes: 0,
    comments: 0,
    attachments: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    author: null,
    order,
    replay: null,
  };
}

/** The stack as it ends up after the writes, to check the visual result. */
function apply(stack: Issue[], writes: { id: string; order: number | null }[]): string[] {
  const byId = new Map(writes.map((w) => [w.id, w.order]));
  return stack
    .map((i) => ({ id: i.id, order: byId.has(i.id) ? (byId.get(i.id) ?? null) : i.order }))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
    .map((i) => i.id);
}

describe("reorderStack", () => {
  const stack = [issue("a"), issue("b"), issue("c")];

  it("numbers the whole stack on the first drag", () => {
    const writes = reorderStack(stack, stack[2]!, "a", true);
    expect(writes).toEqual([
      { id: "c", order: 0 },
      { id: "a", order: 1 },
      { id: "b", order: 2 },
    ]);
  });

  it("dropping after the target puts the card right below it", () => {
    const writes = reorderStack(stack, stack[0]!, "b", false);
    expect(apply(stack, writes)).toEqual(["b", "a", "c"]);
  });

  it("writes only what changed position", () => {
    const arranged = [issue("a", 0), issue("b", 1), issue("c", 2)];
    const writes = reorderStack(arranged, arranged[1]!, "c", false);
    expect(writes).toEqual([
      { id: "c", order: 1 },
      { id: "b", order: 2 },
    ]);
  });

  it("dropping onto itself writes nothing", () => {
    expect(reorderStack(stack, stack[1]!, "b", true)).toEqual([]);
  });

  it("a target outside the stack writes nothing", () => {
    expect(reorderStack(stack, stack[0]!, "gone", true)).toEqual([]);
  });

  it("a card arriving from another column joins the destination stack", () => {
    const fromAnotherColumn = issue("z", 7);
    const writes = reorderStack(stack, fromAnotherColumn, "b", true);
    expect(writes).toEqual([
      { id: "a", order: 0 },
      { id: "z", order: 1 },
      { id: "b", order: 2 },
      { id: "c", order: 3 },
    ]);
  });

  it("writes the position over the whole stack, not over what the filter shows", () => {
    // "b" is hidden by a filter; dragging "c" onto "a" must not carry it along
    // nor swap it with somebody it never saw.
    const whole = [issue("a", 0), issue("b", 1), issue("c", 2)];
    const writes = reorderStack(whole, whole[2]!, "a", true);
    expect(apply(whole, writes)).toEqual(["c", "a", "b"]);
  });
});

describe("releaseStack", () => {
  it("clears the number from whoever has one, and only those", () => {
    expect(releaseStack([issue("a", 0), issue("b"), issue("c", 1)])).toEqual([
      { id: "a", order: null },
      { id: "c", order: null },
    ]);
  });
});
