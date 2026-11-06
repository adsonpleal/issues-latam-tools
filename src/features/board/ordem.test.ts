import { describe, expect, it } from "vitest";

import type { Issue } from "../../lib/issues";
import { reordenarPilha, soltarPilha } from "./ordem";

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

/** A pilha como ela fica depois das escritas, para conferir o resultado visual. */
function aplicar(pilha: Issue[], escritas: { id: string; order: number | null }[]): string[] {
  const mapa = new Map(escritas.map((e) => [e.id, e.order]));
  return pilha
    .map((i) => ({ id: i.id, order: mapa.has(i.id) ? (mapa.get(i.id) ?? null) : i.order }))
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
    .map((i) => i.id);
}

describe("reordenarPilha", () => {
  const pilha = [issue("a"), issue("b"), issue("c")];

  it("numera a pilha inteira no primeiro arrasto", () => {
    const escritas = reordenarPilha(pilha, pilha[2]!, "a", true);
    expect(escritas).toEqual([
      { id: "c", order: 0 },
      { id: "a", order: 1 },
      { id: "b", order: 2 },
    ]);
  });

  it("soltar depois do alvo põe o card logo abaixo dele", () => {
    const escritas = reordenarPilha(pilha, pilha[0]!, "b", false);
    expect(aplicar(pilha, escritas)).toEqual(["b", "a", "c"]);
  });

  it("grava só o que mudou de posição", () => {
    const arrumada = [issue("a", 0), issue("b", 1), issue("c", 2)];
    const escritas = reordenarPilha(arrumada, arrumada[1]!, "c", false);
    expect(escritas).toEqual([
      { id: "c", order: 1 },
      { id: "b", order: 2 },
    ]);
  });

  it("soltar em cima de si mesmo não escreve nada", () => {
    expect(reordenarPilha(pilha, pilha[1]!, "b", true)).toEqual([]);
  });

  it("alvo fora da pilha não escreve nada", () => {
    expect(reordenarPilha(pilha, pilha[0]!, "sumiu", true)).toEqual([]);
  });

  it("card vindo de outra coluna entra na pilha de destino", () => {
    const deOutraColuna = issue("z", 7);
    const escritas = reordenarPilha(pilha, deOutraColuna, "b", true);
    expect(escritas).toEqual([
      { id: "a", order: 0 },
      { id: "z", order: 1 },
      { id: "b", order: 2 },
      { id: "c", order: 3 },
    ]);
  });

  it("posição é gravada sobre a pilha inteira, não sobre o que o filtro mostra", () => {
    // "b" está escondido por um filtro; arrastar "c" para cima de "a" não pode
    // levá-lo junto nem trocá-lo de lugar com quem ele nunca viu.
    const completa = [issue("a", 0), issue("b", 1), issue("c", 2)];
    const escritas = reordenarPilha(completa, completa[2]!, "a", true);
    expect(aplicar(completa, escritas)).toEqual(["c", "a", "b"]);
  });
});

describe("soltarPilha", () => {
  it("apaga o número de quem tem um, e só", () => {
    expect(soltarPilha([issue("a", 0), issue("b"), issue("c", 1)])).toEqual([
      { id: "a", order: null },
      { id: "c", order: null },
    ]);
  });
});
