import { describe, expect, it } from "vitest";

import type { Recording } from "../../lib/recordings";
import { formatDuration, summaryRows, splitRecordings } from "./recordings";

function recording(over: Partial<Recording> & { id: string }): Recording {
  return {
    title: "Gravação: Executor nv 240/50",
    notes: "",
    summary: {},
    nick: null,
    contact: null,
    fileName: "sessao.rrf",
    size: 80_000,
    // The stored state values keep their spelling here too.
    state: "fila",
    createdAt: new Date("2026-01-01"),
    issueId: null,
    decidedAt: null,
    triageNote: null,
    ...over,
  };
}

describe("splitRecordings", () => {
  it("splits the three stacks by state", () => {
    const r = splitRecordings([
      recording({ id: "new" }),
      recording({ id: "published", state: "promovida", issueId: "published" }),
      recording({ id: "checked", state: "conferida" }),
      recording({ id: "discarded", state: "descartada" }),
    ]);
    expect(r.queue.map((g) => g.id)).toEqual(["new"]);
    expect(r.promoted.map((g) => g.id)).toEqual(["published"]);
    // Checked and discarded are the two ways of closing without publishing.
    expect(r.decided.map((g) => g.id).sort()).toEqual(["checked", "discarded"]);
  });

  it("sorts the queue by arrival and the decided ones by the stamp", () => {
    const r = splitRecordings([
      recording({ id: "old", createdAt: new Date("2026-01-01") }),
      recording({ id: "new", createdAt: new Date("2026-06-01") }),
      recording({
        id: "closed-earlier",
        state: "descartada",
        decidedAt: new Date("2026-02-01"),
      }),
      recording({
        id: "closed-just-now",
        state: "conferida",
        decidedAt: new Date("2026-08-01"),
      }),
    ]);
    expect(r.queue.map((g) => g.id)).toEqual(["new", "old"]);
    expect(r.decided.map((g) => g.id)).toEqual(["closed-just-now", "closed-earlier"]);
  });
});

describe("formatDuration", () => {
  it("turns milliseconds into minutes and seconds", () => {
    expect(formatDuration(133_400)).toBe("2m 13s");
    expect(formatDuration(45_000)).toBe("45s");
  });

  it("returns null for what cannot be shown", () => {
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration("2m")).toBeNull();
  });
});

describe("summaryRows", () => {
  it("shows the essentials even with an empty summary", () => {
    const keys = summaryRows({}).map((l) => l.key);
    expect(keys).toEqual(["character", "hits", "changes", "version"]);
  });

  it("adds the optional rows when the parser brought them", () => {
    const rows = summaryRows({
      className: "Mestre Ferreiro",
      player: "Bigorna",
      baseLevel: 175,
      jobLevel: 60,
      dummyHits: 40,
      damageEvents: 52,
      equipChangeCount: 3,
      durationMs: 90_000,
      traits: { pow: 10, con: 5 },
      traitsSource: "replay",
      skippedItems: [1234, 5678],
      appVersion: "2.4.1",
      fileName: "sessao.rrf",
    });
    const byKey = Object.fromEntries(rows.map((l) => [l.key, l]));
    expect(byKey["character"]?.value).toBe("Mestre Ferreiro — Bigorna (nv 175/60)");
    expect(byKey["hits"]?.value).toBe("40 em dummy · 52 no total");
    expect(byKey["traits"]?.value).toBe("POW 10 · CON 5");
    // The help text is read by the admin, so it stays in Portuguese.
    expect(byKey["traits"]?.help).toBe("lidos da gravação");
    expect(byKey["items"]?.value).toBe("1234, 5678");
    expect(byKey["duration"]?.value).toBe("1m 30s");
    expect(byKey["file"]?.value).toBe("sessao.rrf");
  });

  it("turns the migration's empty version into a question mark, not a blank row", () => {
    expect(summaryRows({ appVersion: "" }).find((l) => l.key === "version")?.value).toBe("?");
  });
});
