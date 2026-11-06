import { describe, expect, it } from "vitest";

import type { Issue } from "../../lib/issues";
import { group, groupForAdmin, filter, NO_FILTERS, stack } from "./agrupar";

function issue(over: Partial<Issue> & { id: string }): Issue {
  return {
    project: "simulador",
    title: "titulo",
    description: "descricao",
    type: "bug",
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

describe("filtrar", () => {
  const base = [
    issue({ id: "a", project: "simulador", type: "bug", title: "Carta Mosca Caçadora" }),
    issue({ id: "b", project: "recap", type: "feature", title: "Falta Ceifador de Almas" }),
    issue({ id: "c", project: "simulador", type: "feature", description: "tooltip no item" }),
  ];

  it("sem filtro devolve tudo", () => {
    expect(filter(base, NO_FILTERS)).toHaveLength(3);
  });

  it("filtra por projeto", () => {
    const r = filter(base, { ...NO_FILTERS, project: "simulador" });
    expect(r.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("filtra por tipo", () => {
    const r = filter(base, { ...NO_FILTERS, type: "feature" });
    expect(r.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("combina projeto e tipo", () => {
    const r = filter(base, { ...NO_FILTERS, project: "simulador", type: "feature" });
    expect(r.map((i) => i.id)).toEqual(["c"]);
  });

  it("busca ignora acento e caixa", () => {
    expect(filter(base, { ...NO_FILTERS, search: "cacadora" }).map((i) => i.id)).toEqual(["a"]);
    expect(filter(base, { ...NO_FILTERS, search: "CEIFADOR" }).map((i) => i.id)).toEqual(["b"]);
  });

  it("busca também na descrição", () => {
    expect(filter(base, { ...NO_FILTERS, search: "tooltip" }).map((i) => i.id)).toEqual(["c"]);
  });
});

describe("agrupar", () => {
  it("devolve as cinco colunas na ordem, mesmo vazias", () => {
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

  it("nunca mostra arquivado — nem quando o status ainda é público", () => {
    const r = group([issue({ id: "x", status: "resolvido", archived: true })], NO_FILTERS);
    expect(r.flatMap((c) => c.issues)).toHaveLength(0);
  });

  it("ordena as colunas abertas por votos e desempata pelo mais novo", () => {
    const r = group(
      [
        issue({ id: "poucos", upvotes: 1, createdAt: new Date("2026-05-01") }),
        issue({ id: "muitos", upvotes: 9, createdAt: new Date("2026-01-01") }),
        issue({ id: "novo", upvotes: 1, createdAt: new Date("2026-06-01") }),
      ],
      NO_FILTERS,
    );
    expect(r[0]?.issues.map((i) => i.id)).toEqual(["muitos", "novo", "poucos"]);
  });

  it("ordena resolvido pela última atualização, não por votos", () => {
    const r = group(
      [
        issue({
          id: "antigo",
          status: "resolvido",
          upvotes: 99,
          updatedAt: new Date("2026-01-01"),
        }),
        issue({
          id: "recente",
          status: "resolvido",
          upvotes: 0,
          updatedAt: new Date("2026-08-01"),
        }),
      ],
      NO_FILTERS,
    );
    const resolvido = r.find((c) => c.column === "resolvido");
    expect(resolvido?.issues.map((i) => i.id)).toEqual(["recente", "antigo"]);
  });

  it("ordem arrumada à mão manda mais que os votos", () => {
    const r = group(
      [
        issue({ id: "campeao", upvotes: 99 }),
        issue({ id: "fixado", upvotes: 0, order: 0 }),
      ],
      NO_FILTERS,
    );
    expect(r[0]?.issues.map((i) => i.id)).toEqual(["fixado", "campeao"]);
  });

  it("quem não foi arrumado flui embaixo da pilha arrumada, pela regra da coluna", () => {
    const r = group(
      [
        issue({ id: "solto-pouco", upvotes: 1 }),
        issue({ id: "fixado-2", order: 1 }),
        issue({ id: "solto-muito", upvotes: 8 }),
        issue({ id: "fixado-1", order: 0 }),
      ],
      NO_FILTERS,
    );
    expect(r[0]?.issues.map((i) => i.id)).toEqual([
      "fixado-1",
      "fixado-2",
      "solto-muito",
      "solto-pouco",
    ]);
  });

  it("a ordem manual também vale nas colunas de encerramento", () => {
    const r = group(
      [
        issue({ id: "recente", status: "resolvido", updatedAt: new Date("2026-08-01") }),
        issue({ id: "fixado", status: "resolvido", updatedAt: new Date("2026-01-01"), order: 0 }),
      ],
      NO_FILTERS,
    );
    expect(r.find((c) => c.column === "resolvido")?.issues.map((i) => i.id)).toEqual([
      "fixado",
      "recente",
    ]);
  });

  it("aplica o filtro de projeto dentro das colunas", () => {
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

describe("pilha", () => {
  it("devolve a coluna inteira, ignorando qualquer filtro", () => {
    const r = stack(
      [
        issue({ id: "a", status: "backlog", upvotes: 1, project: "recap" }),
        issue({ id: "b", status: "backlog", upvotes: 5, project: "calc" }),
        issue({ id: "fora", status: "reportado" }),
      ],
      "backlog",
    );
    expect(r.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("a gaveta de arquivados é uma pilha como as outras", () => {
    const r = stack([issue({ id: "x", status: "resolvido", archived: true })], "arquivado");
    expect(r.map((i) => i.id)).toEqual(["x"]);
  });
});

describe("agruparAdmin", () => {
  it("acrescenta a coluna de arquivados no fim", () => {
    const r = groupForAdmin([issue({ id: "x", archived: true })], NO_FILTERS);
    expect(r).toHaveLength(6);
    expect(r[5]?.column).toBe("arquivado");
    expect(r[5]?.issues.map((i) => i.id)).toEqual(["x"]);
  });

  it("card arquivado sai da coluna de status original", () => {
    const r = groupForAdmin(
      [issue({ id: "x", status: "em_progresso", archived: true })],
      NO_FILTERS,
    );
    expect(r.find((c) => c.column === "em_progresso")?.issues).toHaveLength(0);
  });
});
