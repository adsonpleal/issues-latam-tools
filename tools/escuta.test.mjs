import { describe, expect, it } from "vitest";

import { depois, instante, linha, novidades } from "./escuta.mjs";

/** O `Timestamp` do SDK: os dois campos, mais o `toJSON` que atrapalha. */
const ts = (seconds, nanoseconds = 0) => ({
  seconds,
  nanoseconds,
  toJSON: () => ({ type: "firestore/timestamp/1.0", seconds, nanoseconds }),
});

const card = (id, extra = {}) => ({
  id,
  projeto: "simulador",
  tipo: "bug",
  titulo: `card ${id}`,
  criadoEm: ts(2000),
  ...extra,
});

describe("instante", () => {
  it("devolve os dois campos e nada mais", () => {
    expect(instante(ts(7, 42))).toEqual({ seconds: 7, nanoseconds: 42 });
  });

  it("aceita a forma que o SDK já gravou em disco, com o `type` sobrando", () => {
    expect(instante({ type: "firestore/timestamp/1.0", seconds: 7, nanoseconds: 42 })).toEqual({
      seconds: 7,
      nanoseconds: 42,
    });
  });

  it("recusa o que não é instante", () => {
    for (const v of [null, undefined, {}, { seconds: 7 }, "2026-01-01", 7]) {
      expect(instante(v)).toBeNull();
    }
  });
});

describe("depois", () => {
  it("compara pelos nanossegundos quando o segundo é o mesmo", () => {
    expect(depois({ seconds: 5, nanoseconds: 2 }, { seconds: 5, nanoseconds: 1 })).toBe(true);
    expect(depois({ seconds: 5, nanoseconds: 1 }, { seconds: 5, nanoseconds: 2 })).toBe(false);
    expect(depois({ seconds: 5, nanoseconds: 1 }, { seconds: 5, nanoseconds: 1 })).toBe(false);
  });

  /**
   * O defeito que esta função existe para não ter: com a marca truncada em
   * milissegundos, o card de onde ela saiu continua "depois" dela e volta a ser
   * novidade em todo recomeço. Era o que aconteceria comparando por `Date`.
   */
  it("não enxerga como novo o card de onde a própria marca saiu", () => {
    const criado = { seconds: 1793407973, nanoseconds: 377_481_000 };
    const truncada = { seconds: 1793407973, nanoseconds: 377_000_000 };
    expect(depois(criado, criado)).toBe(false);
    expect(depois(criado, truncada)).toBe(true);
  });
});

describe("novidades", () => {
  const marca = { seconds: 1000, nanoseconds: 0 };

  it("anuncia só o que passou da marca", () => {
    const r = novidades([card("velho", { criadoEm: ts(500) }), card("novo", { criadoEm: ts(2000) })], marca);
    expect(r.novos.map((c) => c.id)).toEqual(["novo"]);
    expect(r.marca).toEqual({ seconds: 2000, nanoseconds: 0 });
  });

  it("não mexe na marca quando não há novidade", () => {
    const r = novidades([card("velho", { criadoEm: ts(500) })], marca);
    expect(r.novos).toEqual([]);
    expect(r.marca).toBe(marca);
  });

  it("guarda o instante mais novo do lote, não o último da lista", () => {
    const r = novidades([card("a", { criadoEm: ts(5000) }), card("b", { criadoEm: ts(3000) })], marca);
    expect(r.marca).toEqual({ seconds: 5000, nanoseconds: 0 });
  });

  it("deixa gravação de fora — ela não é pedido de ninguém", () => {
    const r = novidades([card("g", { tipo: "replay" })], marca);
    expect(r.novos).toEqual([]);
  });

  it("deixa de fora projeto sem repositório conhecido", () => {
    const r = novidades([card("x", { projeto: "inexistente" })], marca);
    expect(r.novos).toEqual([]);
  });

  /**
   * Card descartado tem de mexer na marca. Sem isso ele é reexaminado em todo
   * recomeço, e a marca passa a mentir sobre o que a escuta já viu.
   */
  it("avança a marca mesmo pelo card que descartou", () => {
    const r = novidades([card("g", { tipo: "replay", criadoEm: ts(9000) })], marca);
    expect(r.novos).toEqual([]);
    expect(r.marca).toEqual({ seconds: 9000, nanoseconds: 0 });
  });

  it("ignora card sem criadoEm em vez de quebrar a escuta", () => {
    const r = novidades([card("sem", { criadoEm: undefined }), card("com", { criadoEm: ts(2000) })], marca);
    expect(r.novos.map((c) => c.id)).toEqual(["com"]);
  });

  it("guarda instante puro, sem a forma interna do SDK", () => {
    const r = novidades([card("novo", { criadoEm: ts(2000, 5) })], marca);
    expect(Object.keys(r.marca).sort()).toEqual(["nanoseconds", "seconds"]);
  });
});

describe("linha", () => {
  it("leva id, projeto, título e o link do card", () => {
    expect(linha(card("abc", { titulo: "Título com acento" }))).toBe(
      "NOVO abc | simulador | Título com acento | https://issues.latam-tools.com.br/t/abc",
    );
  });

  it("escapa o id no link", () => {
    expect(linha(card("a/b"))).toContain("/t/a%2Fb");
  });
});
