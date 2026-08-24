import { describe, expect, it } from "vitest";

import type { Issue } from "../../lib/issues";
import { reordenarPilha, soltarPilha } from "./ordem";

function issue(id: string, ordem: number | null = null): Issue {
  return {
    id,
    projeto: "simulador",
    titulo: id,
    descricao: "",
    tipo: "bug",
    status: "backlog",
    arquivado: false,
    upvotes: 0,
    comentarios: 0,
    anexos: 0,
    criadoEm: new Date("2026-01-01"),
    atualizadoEm: new Date("2026-01-01"),
    autor: null,
    ordem,
    replay: null,
  };
}

/** A pilha como ela fica depois das escritas, para conferir o resultado visual. */
function aplicar(pilha: Issue[], escritas: { id: string; ordem: number | null }[]): string[] {
  const mapa = new Map(escritas.map((e) => [e.id, e.ordem]));
  return pilha
    .map((i) => ({ id: i.id, ordem: mapa.has(i.id) ? (mapa.get(i.id) ?? null) : i.ordem }))
    .sort((a, b) => (a.ordem ?? Infinity) - (b.ordem ?? Infinity))
    .map((i) => i.id);
}

describe("reordenarPilha", () => {
  const pilha = [issue("a"), issue("b"), issue("c")];

  it("numera a pilha inteira no primeiro arrasto", () => {
    const escritas = reordenarPilha(pilha, pilha[2]!, "a", true);
    expect(escritas).toEqual([
      { id: "c", ordem: 0 },
      { id: "a", ordem: 1 },
      { id: "b", ordem: 2 },
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
      { id: "c", ordem: 1 },
      { id: "b", ordem: 2 },
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
      { id: "a", ordem: 0 },
      { id: "z", ordem: 1 },
      { id: "b", ordem: 2 },
      { id: "c", ordem: 3 },
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
      { id: "a", ordem: null },
      { id: "c", ordem: null },
    ]);
  });
});
