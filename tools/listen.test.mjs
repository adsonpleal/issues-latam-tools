import { describe, expect, it } from "vitest";

import { announcement, freshCards, instant, isAfter, reconcileReport } from "./listen.mjs";

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

  it("keys freshness on when the card was moved, not when it was filed", () => {
    // A card approved today may have been reported weeks ago. Keyed on
    // `criadoEm`, that card would notify nobody -- the listener would decide it
    // was older than the watermark and stay quiet.
    const r = freshCards([card("old", { criadoEm: stamp(500), atualizadoEm: stamp(5000) })], mark);
    expect(r.fresh.map((c) => c.id)).toEqual(["old"]);
  });

  it("stores a bare instant, without the SDK's internal shape", () => {
    const r = freshCards([card("new", { criadoEm: stamp(2000, 5) })], mark);
    expect(Object.keys(r.mark).sort()).toEqual(["nanoseconds", "seconds"]);
  });
});

describe("reconcileReport", () => {
  // Verbatim from a real run, the one that found six cards left behind.
  const run = [
    "HEb9jHvMXjynEMvNaDhP -> resolvido (adsonpleal/latam-ro-calc#81)",
    "LyHHrLLj9kAd5eCzE3Ay -> resolvido (adsonpleal/latam-ro-calc#82)",
    "reconciliados: 6 de 7 card(s) com PR",
    "",
  ].join("\n");

  it("announces the cards that moved", () => {
    expect(reconcileReport(run, "", 0)).toEqual([
      "HEb9jHvMXjynEMvNaDhP -> resolvido (adsonpleal/latam-ro-calc#81)",
      "LyHHrLLj9kAd5eCzE3Ay -> resolvido (adsonpleal/latam-ro-calc#82)",
    ]);
  });

  /**
   * The summary is printed on every run. Announcing it every quarter of an hour
   * would teach whoever reads these notifications to stop reading them.
   */
  it("stays quiet on a run where nothing moved", () => {
    expect(reconcileReport("reconciliados: 0 de 2 card(s) com PR\n", "", 0)).toEqual([]);
  });

  /**
   * The case that matters most, and the one an exit-code check misses entirely.
   * `reconciliar` catches a `gh` failure per card, writes the reason to stderr,
   * skips that card and carries on — so the run **succeeds** with a card left
   * behind. An expired `gh` login would quietly stop every card from closing.
   */
  it("speaks up about a card gh could not answer for, even on a clean exit", () => {
    const stderr = "abc123: não consegui ler adsonpleal/latam-ro-calc#90 — gh: not authenticated\n";
    expect(reconcileReport("reconciliados: 0 de 1 card(s) com PR\n", stderr, 0)).toEqual([
      "RECONCILE PROBLEM: abc123: não consegui ler adsonpleal/latam-ro-calc#90 — gh: not authenticated",
    ]);
  });

  it("reports what moved and what failed in the same run", () => {
    expect(reconcileReport(run, "xyz: HTTP 429\n", 0)).toEqual([
      "HEb9jHvMXjynEMvNaDhP -> resolvido (adsonpleal/latam-ro-calc#81)",
      "LyHHrLLj9kAd5eCzE3Ay -> resolvido (adsonpleal/latam-ro-calc#82)",
      "RECONCILE PROBLEM: xyz: HTTP 429",
    ]);
  });

  it("adds a failure line when the command itself exits non-zero", () => {
    expect(reconcileReport("", "sem tópico do ntfy\n", 1)).toEqual([
      "RECONCILE PROBLEM: sem tópico do ntfy",
      "RECONCILE FAILED: sem tópico do ntfy",
    ]);
  });

  it("reports a spawn failure, where the code is not a number", () => {
    expect(reconcileReport("", "", "ENOENT")).toEqual(["RECONCILE FAILED: exit ENOENT"]);
  });
});

describe("announcement", () => {
  it("carries id, project, title and the card link", () => {
    expect(announcement(card("abc", { titulo: "Título com acento" }))).toBe(
      "READY abc | simulador | Título com acento | https://issues.latam-tools.com.br/t/abc",
    );
  });

  it("escapes the id inside the link", () => {
    expect(announcement(card("a/b"))).toContain("/t/a%2Fb");
  });
});
