import { describe, expect, it } from "vitest";

import { announcement, freshCards, instant, isAfter } from "./listen.mjs";

/** The SDK's `Timestamp`: the two fields, plus the `toJSON` that gets in the way. */
const stamp = (seconds, nanoseconds = 0) => ({
  seconds,
  nanoseconds,
  toJSON: () => ({ type: "firestore/timestamp/1.0", seconds, nanoseconds }),
});

const card = (id, extra = {}) => ({
  id,
  projeto: "simulador",
  tipo: "bug",
  titulo: `card ${id}`,
  criadoEm: stamp(2000),
  ...extra,
});

describe("instant", () => {
  it("returns the two fields and nothing else", () => {
    expect(instant(stamp(7, 42))).toEqual({ seconds: 7, nanoseconds: 42 });
  });

  it("accepts the shape the SDK has already written to disk, spare `type` included", () => {
    expect(instant({ type: "firestore/timestamp/1.0", seconds: 7, nanoseconds: 42 })).toEqual({
      seconds: 7,
      nanoseconds: 42,
    });
  });

  it("rejects anything that is not an instant", () => {
    for (const value of [null, undefined, {}, { seconds: 7 }, "2026-01-01", 7]) {
      expect(instant(value)).toBeNull();
    }
  });
});

describe("isAfter", () => {
  it("falls through to nanoseconds when the second matches", () => {
    expect(isAfter({ seconds: 5, nanoseconds: 2 }, { seconds: 5, nanoseconds: 1 })).toBe(true);
    expect(isAfter({ seconds: 5, nanoseconds: 1 }, { seconds: 5, nanoseconds: 2 })).toBe(false);
    expect(isAfter({ seconds: 5, nanoseconds: 1 }, { seconds: 5, nanoseconds: 1 })).toBe(false);
  });

  /**
   * The defect this function exists to avoid: with the watermark truncated to
   * milliseconds, the card it came from still counts as "after" it and becomes
   * news again on every restart. That is what comparing through `Date` would do.
   */
  it("does not see the card its own watermark came from as new", () => {
    const created = { seconds: 1793407973, nanoseconds: 377_481_000 };
    const truncated = { seconds: 1793407973, nanoseconds: 377_000_000 };
    expect(isAfter(created, created)).toBe(false);
    expect(isAfter(created, truncated)).toBe(true);
  });
});

describe("freshCards", () => {
  const mark = { seconds: 1000, nanoseconds: 0 };

  it("announces only what is past the watermark", () => {
    const r = freshCards(
      [card("old", { criadoEm: stamp(500) }), card("new", { criadoEm: stamp(2000) })],
      mark,
    );
    expect(r.fresh.map((c) => c.id)).toEqual(["new"]);
    expect(r.mark).toEqual({ seconds: 2000, nanoseconds: 0 });
  });

  it("leaves the watermark alone when there is nothing new", () => {
    const r = freshCards([card("old", { criadoEm: stamp(500) })], mark);
    expect(r.fresh).toEqual([]);
    expect(r.mark).toBe(mark);
  });

  it("keeps the highest instant in the batch, not the last one in the list", () => {
    const r = freshCards(
      [card("a", { criadoEm: stamp(5000) }), card("b", { criadoEm: stamp(3000) })],
      mark,
    );
    expect(r.mark).toEqual({ seconds: 5000, nanoseconds: 0 });
  });

  it("leaves recordings out — they are nobody's request", () => {
    expect(freshCards([card("r", { tipo: "replay" })], mark).fresh).toEqual([]);
  });

  it("leaves out a project with no known repository", () => {
    expect(freshCards([card("x", { projeto: "nonexistent" })], mark).fresh).toEqual([]);
  });

  /**
   * A discarded card has to move the watermark. Without that it is re-examined
   * on every restart, and the watermark starts lying about what has been seen.
   */
  it("advances the watermark even on a card it discarded", () => {
    const r = freshCards([card("r", { tipo: "replay", criadoEm: stamp(9000) })], mark);
    expect(r.fresh).toEqual([]);
    expect(r.mark).toEqual({ seconds: 9000, nanoseconds: 0 });
  });

  it("skips a card with no criadoEm instead of breaking the listener", () => {
    const r = freshCards(
      [card("without", { criadoEm: undefined }), card("with", { criadoEm: stamp(2000) })],
      mark,
    );
    expect(r.fresh.map((c) => c.id)).toEqual(["with"]);
  });

  it("stores a bare instant, without the SDK's internal shape", () => {
    const r = freshCards([card("new", { criadoEm: stamp(2000, 5) })], mark);
    expect(Object.keys(r.mark).sort()).toEqual(["nanoseconds", "seconds"]);
  });
});

describe("announcement", () => {
  it("carries id, project, title and the card link", () => {
    expect(announcement(card("abc", { titulo: "Título com acento" }))).toBe(
      "NEW abc | simulador | Título com acento | https://issues.latam-tools.com.br/t/abc",
    );
  });

  it("escapes the id inside the link", () => {
    expect(announcement(card("a/b"))).toContain("/t/a%2Fb");
  });
});
