import { describe, expect, it } from "vitest";

import type { Issue } from "../../lib/issues";
import { group, groupForAdmin, filter, NO_FILTERS, stack } from "./agrupar";

function issue(over: Partial<Issue> & { id: string }): Issue {
  return {
    project: "simulador",
    title: "titulo",
    description: "descricao",
    type: "bug",
    // The column values are stored on the document, so they keep their spelling.
    status: "reportado",
    archived: false,
    upvotes: 0,
    comments: 0,
    attachments: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    author: null,
    order: null,
    replay: null,
    ...over,
  };
}

describe("filter", () => {
  const base = [
    issue({ id: "a", project: "simulador", type: "bug", title: "Carta Mosca Caçadora" }),
    issue({ id: "b", project: "recap", type: "feature", title: "Falta Ceifador de Almas" }),
    issue({ id: "c", project: "simulador", type: "feature", description: "tooltip no item" }),
  ];

  it("returns everything with no filter", () => {
    expect(filter(base, NO_FILTERS)).toHaveLength(3);
  });

  it("filters by project", () => {
    const r = filter(base, { ...NO_FILTERS, project: "simulador" });
    expect(r.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("filters by type", () => {
    const r = filter(base, { ...NO_FILTERS, type: "feature" });
    expect(r.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("combines project and type", () => {
    const r = filter(base, { ...NO_FILTERS, project: "simulador", type: "feature" });
    expect(r.map((i) => i.id)).toEqual(["c"]);
  });

  it("searches past accents and case", () => {
    expect(filter(base, { ...NO_FILTERS, search: "cacadora" }).map((i) => i.id)).toEqual(["a"]);
    expect(filter(base, { ...NO_FILTERS, search: "CEIFADOR" }).map((i) => i.id)).toEqual(["b"]);
  });

  it("searches the description too", () => {
    expect(filter(base, { ...NO_FILTERS, search: "tooltip" }).map((i) => i.id)).toEqual(["c"]);
  });
});

describe("group", () => {
  it("returns the five columns in order, even empty", () => {
    const r = group([], NO_FILTERS);
    expect(r.map((c) => c.column)).toEqual([
      "reportado",
      "backlog",
      "em_progresso",
      "resolvido",
      "nao_sera_feito",
    ]);
    expect(r.every((c) => c.issues.length === 0)).toBe(true);
  });

  it("never shows an archived card -- not even while the status is still public", () => {
    const r = group([issue({ id: "x", status: "resolvido", archived: true })], NO_FILTERS);
    expect(r.flatMap((c) => c.issues)).toHaveLength(0);
  });

  it("sorts the open columns by votes and breaks ties by the newest", () => {
    const r = group(
      [
        issue({ id: "few-votes", upvotes: 1, createdAt: new Date("2026-05-01") }),
        issue({ id: "many-votes", upvotes: 9, createdAt: new Date("2026-01-01") }),
        issue({ id: "newer", upvotes: 1, createdAt: new Date("2026-06-01") }),
      ],
      NO_FILTERS,
    );
    expect(r[0]?.issues.map((i) => i.id)).toEqual(["many-votes", "newer", "few-votes"]);
  });

  it("sorts resolvido by the last update, not by votes", () => {
    const r = group(
      [
        issue({
          id: "older",
          status: "resolvido",
          upvotes: 99,
          updatedAt: new Date("2026-01-01"),
        }),
        issue({
          id: "recent",
          status: "resolvido",
          upvotes: 0,
          updatedAt: new Date("2026-08-01"),
        }),
      ],
      NO_FILTERS,
    );
    const resolved = r.find((c) => c.column === "resolvido");
    expect(resolved?.issues.map((i) => i.id)).toEqual(["recent", "older"]);
  });

  it("an order arranged by hand outranks the votes", () => {
    const r = group(
      [
        issue({ id: "champion", upvotes: 99 }),
        issue({ id: "pinned", upvotes: 0, order: 0 }),
      ],
      NO_FILTERS,
    );
    expect(r[0]?.issues.map((i) => i.id)).toEqual(["pinned", "champion"]);
  });

  it("whoever was not arranged flows below the arranged stack, by the column's rule", () => {
    const r = group(
      [
        issue({ id: "loose-few", upvotes: 1 }),
        issue({ id: "pinned-2", order: 1 }),
        issue({ id: "loose-many", upvotes: 8 }),
        issue({ id: "pinned-1", order: 0 }),
      ],
      NO_FILTERS,
    );
    expect(r[0]?.issues.map((i) => i.id)).toEqual([
      "pinned-1",
      "pinned-2",
      "loose-many",
      "loose-few",
    ]);
  });

  it("the manual order holds in the closing columns too", () => {
    const r = group(
      [
        issue({ id: "recent", status: "resolvido", updatedAt: new Date("2026-08-01") }),
        issue({ id: "pinned", status: "resolvido", updatedAt: new Date("2026-01-01"), order: 0 }),
      ],
      NO_FILTERS,
    );
    expect(r.find((c) => c.column === "resolvido")?.issues.map((i) => i.id)).toEqual([
      "pinned",
      "recent",
    ]);
  });

  it("applies the project filter inside the columns", () => {
    const r = group(
      [
        issue({ id: "a", project: "recap" }),
        issue({ id: "b", project: "calc", status: "backlog" }),
      ],
      { ...NO_FILTERS, project: "recap" },
    );
    expect(r.flatMap((c) => c.issues).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("stack", () => {
  it("returns the whole column, ignoring any filter", () => {
    const r = stack(
      [
        issue({ id: "a", status: "backlog", upvotes: 1, project: "recap" }),
        issue({ id: "b", status: "backlog", upvotes: 5, project: "calc" }),
        issue({ id: "outside", status: "reportado" }),
      ],
      "backlog",
    );
    expect(r.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("the archive drawer is a stack like any other", () => {
    const r = stack([issue({ id: "x", status: "resolvido", archived: true })], "arquivado");
    expect(r.map((i) => i.id)).toEqual(["x"]);
  });
});

describe("groupForAdmin", () => {
  it("adds the archive column at the end", () => {
    const r = groupForAdmin([issue({ id: "x", archived: true })], NO_FILTERS);
    expect(r).toHaveLength(6);
    expect(r[5]?.column).toBe("arquivado");
    expect(r[5]?.issues.map((i) => i.id)).toEqual(["x"]);
  });

  it("an archived card leaves its original status column", () => {
    const r = groupForAdmin(
      [issue({ id: "x", status: "em_progresso", archived: true })],
      NO_FILTERS,
    );
    expect(r.find((c) => c.column === "em_progresso")?.issues).toHaveLength(0);
  });
});
