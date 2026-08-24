import { describe, expect, it } from "vitest";

import type { Issue } from "../../lib/issues";
import { agrupar, agruparAdmin, filtrar, FILTROS_VAZIOS, pilha } from "./agrupar";

function issue(over: Partial<Issue> & { id: string }): Issue {
  return {
    projeto: "simulador",
    titulo: "titulo",
    descricao: "descricao",
    tipo: "bug",
    status: "reportado",
    arquivado: false,
    upvotes: 0,
    comentarios: 0,
    anexos: 0,
    criadoEm: new Date("2026-01-01"),
    atualizadoEm: new Date("2026-01-01"),
    autor: null,
    ordem: null,
    replay: null,
    ...over,
  };
}

describe("filtrar", () => {
  const base = [
    issue({ id: "a", projeto: "simulador", tipo: "bug", titulo: "Carta Mosca Caçadora" }),
    issue({ id: "b", projeto: "recap", tipo: "feature", titulo: "Falta Ceifador de Almas" }),
    issue({ id: "c", projeto: "simulador", tipo: "feature", descricao: "tooltip no item" }),
  ];

  it("sem filtro devolve tudo", () => {
    expect(filtrar(base, FILTROS_VAZIOS)).toHaveLength(3);
  });

  it("filtra por projeto", () => {
    const r = filtrar(base, { ...FILTROS_VAZIOS, projeto: "simulador" });
    expect(r.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("filtra por tipo", () => {
    const r = filtrar(base, { ...FILTROS_VAZIOS, tipo: "feature" });
    expect(r.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("combina projeto e tipo", () => {
    const r = filtrar(base, { ...FILTROS_VAZIOS, projeto: "simulador", tipo: "feature" });
    expect(r.map((i) => i.id)).toEqual(["c"]);
  });

  it("busca ignora acento e caixa", () => {
    expect(filtrar(base, { ...FILTROS_VAZIOS, busca: "cacadora" }).map((i) => i.id)).toEqual(["a"]);
    expect(filtrar(base, { ...FILTROS_VAZIOS, busca: "CEIFADOR" }).map((i) => i.id)).toEqual(["b"]);
  });

  it("busca também na descrição", () => {
    expect(filtrar(base, { ...FILTROS_VAZIOS, busca: "tooltip" }).map((i) => i.id)).toEqual(["c"]);
  });
});

describe("agrupar", () => {
  it("devolve as cinco colunas na ordem, mesmo vazias", () => {
    const r = agrupar([], FILTROS_VAZIOS);
    expect(r.map((c) => c.coluna)).toEqual([
      "reportado",
      "backlog",
      "em_progresso",
      "resolvido",
      "nao_sera_feito",
    ]);
    expect(r.every((c) => c.issues.length === 0)).toBe(true);
  });

  it("nunca mostra arquivado — nem quando o status ainda é público", () => {
    const r = agrupar([issue({ id: "x", status: "resolvido", arquivado: true })], FILTROS_VAZIOS);
    expect(r.flatMap((c) => c.issues)).toHaveLength(0);
  });

  it("ordena as colunas abertas por votos e desempata pelo mais novo", () => {
    const r = agrupar(
      [
        issue({ id: "poucos", upvotes: 1, criadoEm: new Date("2026-05-01") }),
        issue({ id: "muitos", upvotes: 9, criadoEm: new Date("2026-01-01") }),
        issue({ id: "novo", upvotes: 1, criadoEm: new Date("2026-06-01") }),
      ],
      FILTROS_VAZIOS,
    );
    expect(r[0]?.issues.map((i) => i.id)).toEqual(["muitos", "novo", "poucos"]);
  });

  it("ordena resolvido pela última atualização, não por votos", () => {
    const r = agrupar(
      [
        issue({
          id: "antigo",
          status: "resolvido",
          upvotes: 99,
          atualizadoEm: new Date("2026-01-01"),
        }),
        issue({
          id: "recente",
          status: "resolvido",
          upvotes: 0,
          atualizadoEm: new Date("2026-08-01"),
        }),
      ],
      FILTROS_VAZIOS,
    );
    const resolvido = r.find((c) => c.coluna === "resolvido");
    expect(resolvido?.issues.map((i) => i.id)).toEqual(["recente", "antigo"]);
  });

  it("ordem arrumada à mão manda mais que os votos", () => {
    const r = agrupar(
      [
        issue({ id: "campeao", upvotes: 99 }),
        issue({ id: "fixado", upvotes: 0, ordem: 0 }),
      ],
      FILTROS_VAZIOS,
    );
    expect(r[0]?.issues.map((i) => i.id)).toEqual(["fixado", "campeao"]);
  });

  it("quem não foi arrumado flui embaixo da pilha arrumada, pela regra da coluna", () => {
    const r = agrupar(
      [
        issue({ id: "solto-pouco", upvotes: 1 }),
        issue({ id: "fixado-2", ordem: 1 }),
        issue({ id: "solto-muito", upvotes: 8 }),
        issue({ id: "fixado-1", ordem: 0 }),
      ],
      FILTROS_VAZIOS,
    );
    expect(r[0]?.issues.map((i) => i.id)).toEqual([
      "fixado-1",
      "fixado-2",
      "solto-muito",
      "solto-pouco",
    ]);
  });

  it("a ordem manual também vale nas colunas de encerramento", () => {
    const r = agrupar(
      [
        issue({ id: "recente", status: "resolvido", atualizadoEm: new Date("2026-08-01") }),
        issue({ id: "fixado", status: "resolvido", atualizadoEm: new Date("2026-01-01"), ordem: 0 }),
      ],
      FILTROS_VAZIOS,
    );
    expect(r.find((c) => c.coluna === "resolvido")?.issues.map((i) => i.id)).toEqual([
      "fixado",
      "recente",
    ]);
  });

  it("aplica o filtro de projeto dentro das colunas", () => {
    const r = agrupar(
      [
        issue({ id: "a", projeto: "recap" }),
        issue({ id: "b", projeto: "calc", status: "backlog" }),
      ],
      { ...FILTROS_VAZIOS, projeto: "recap" },
    );
    expect(r.flatMap((c) => c.issues).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("pilha", () => {
  it("devolve a coluna inteira, ignorando qualquer filtro", () => {
    const r = pilha(
      [
        issue({ id: "a", status: "backlog", upvotes: 1, projeto: "recap" }),
        issue({ id: "b", status: "backlog", upvotes: 5, projeto: "calc" }),
        issue({ id: "fora", status: "reportado" }),
      ],
      "backlog",
    );
    expect(r.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("a gaveta de arquivados é uma pilha como as outras", () => {
    const r = pilha([issue({ id: "x", status: "resolvido", arquivado: true })], "arquivado");
    expect(r.map((i) => i.id)).toEqual(["x"]);
  });
});

describe("agruparAdmin", () => {
  it("acrescenta a coluna de arquivados no fim", () => {
    const r = agruparAdmin([issue({ id: "x", arquivado: true })], FILTROS_VAZIOS);
    expect(r).toHaveLength(6);
    expect(r[5]?.coluna).toBe("arquivado");
    expect(r[5]?.issues.map((i) => i.id)).toEqual(["x"]);
  });

  it("card arquivado sai da coluna de status original", () => {
    const r = agruparAdmin(
      [issue({ id: "x", status: "em_progresso", arquivado: true })],
      FILTROS_VAZIOS,
    );
    expect(r.find((c) => c.coluna === "em_progresso")?.issues).toHaveLength(0);
  });
});
