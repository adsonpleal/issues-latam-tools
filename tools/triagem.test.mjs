import { describe, expect, it } from "vitest";

import { PROJETOS as PROJETOS_APP } from "../src/lib/projetos";
import { COLUNAS } from "../src/lib/status";
import { PASTAS, REPOS, linkDoAviso, maduros, paraCard } from "./triagem.mjs";

const doc = (id, campos, updateTime = "2026-10-30T12:00:00Z") => ({
  name: `projects/p/databases/(default)/documents/issues/${id}`,
  updateTime,
  fields: Object.fromEntries(
    Object.entries(campos).map(([k, v]) => [
      k,
      typeof v === "boolean"
        ? { booleanValue: v }
        : k === "criadoEm"
          ? { timestampValue: v }
          : { stringValue: v },
    ]),
  ),
});

const card = (id, extra = {}) =>
  paraCard(
    doc(id, {
      projeto: "simulador",
      titulo: `card ${id}`,
      descricao: "",
      tipo: "bug",
      status: "reportado",
      arquivado: false,
      criadoEm: "2026-10-30T10:00:00Z",
      ...extra,
    }),
  );

/**
 * A ferramenta é .mjs sem build e não consegue importar o .ts do app, então
 * duplica a lista de projetos. É isto que transforma "entrou um projeto novo no
 * quadro e ninguém mapeou o repositório" em `npm test` vermelho — em vez de uma
 * sessão automática abrindo PR no repositório errado, ou em nenhum.
 */
describe("deriva das constantes do app", () => {
  it("todo projeto do quadro tem repositório e pasta", () => {
    expect(Object.keys(REPOS).sort()).toEqual(Object.keys(PROJETOS_APP).sort());
    expect(Object.keys(PASTAS).sort()).toEqual(Object.keys(PROJETOS_APP).sort());
  });

  it("os repositórios são dono/nome", () => {
    for (const [slug, repo] of Object.entries(REPOS)) {
      expect(repo, slug).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });
});

describe("paraCard", () => {
  it("lê os campos que a fila usa e assume o resto", () => {
    const c = card("abc", { autor: "LeandroPC13", pr: "adsonpleal/latam-ro-calc#75" });
    expect(c).toMatchObject({
      id: "abc",
      projeto: "simulador",
      status: "reportado",
      autor: "LeandroPC13",
      pr: "adsonpleal/latam-ro-calc#75",
      arquivado: false,
      auto: false,
    });
  });

  it("card sem `auto` e sem `pr` não quebra", () => {
    const c = card("sem");
    expect(c.auto).toBe(false);
    expect(c.pr).toBe(null);
  });

  it("guarda o updateTime, que é a precondição de `pegar`", () => {
    expect(card("x").updateTime).toBe("2026-10-30T12:00:00Z");
  });
});

/**
 * O link do aviso é o que o Adson toca no celular, e errá-lo é mandá-lo para
 * lugar nenhum: um card que não virou PR não tem PR para abrir, e é no card que
 * está o comentário explicando por que não virou.
 */
describe("linkDoAviso", () => {
  it("com PR registrado, leva ao PR", () => {
    expect(linkDoAviso(card("x", { pr: "adsonpleal/latam-ro-calc#77" }))).toBe(
      "https://github.com/adsonpleal/latam-ro-calc/pull/77",
    );
  });

  it("sem PR, leva ao card — onde está o comentário da triagem", () => {
    expect(linkDoAviso(card("5qw6V9dyPakGZ6jwMiD8"))).toBe(
      "https://issues.latam-tools.com.br/t/5qw6V9dyPakGZ6jwMiD8",
    );
  });

  it("monta a URL de qualquer um dos repositórios do quadro", () => {
    for (const [slug, repo] of Object.entries(REPOS)) {
      expect(linkDoAviso(card("c", { projeto: slug, pr: `${repo}#1` })), slug).toBe(
        `https://github.com/${repo}/pull/1`,
      );
    }
  });

  /**
   * Quem decide é o campo `pr`, não o status nem a frase que a sessão escreveu:
   * card parado em `backlog` por não proceder manda para o card, e card que já
   * foi mesclado continua mandando para o PR.
   */
  it("é o campo pr que decide, não o status", () => {
    expect(linkDoAviso(card("a", { status: "backlog" }))).toContain("issues.latam-tools.com.br");
    expect(linkDoAviso(card("b", { status: "resolvido", pr: "adsonpleal/ragcalc#3" }))).toContain(
      "github.com",
    );
  });
});

describe("maduros", () => {
  const desde = "2026-10-30T09:00:00Z";

  it("pega só o que está em reportado", () => {
    const cards = COLUNAS.map((status) => card(status, { status }));
    const { fila } = maduros(cards, { desde });
    expect(fila.map((c) => c.id)).toEqual(["reportado"]);
  });

  it("ignora arquivado e gravação", () => {
    const cards = [
      card("ok"),
      card("arq", { arquivado: true }),
      card("gravacao", { tipo: "replay" }),
    ];
    expect(maduros(cards, { desde }).fila.map((c) => c.id)).toEqual(["ok"]);
  });

  it("ignora projeto que não está mapeado", () => {
    const cards = [card("ok"), card("orfao", { projeto: "projeto-que-nao-existe" })];
    expect(maduros(cards, { desde }).fila.map((c) => c.id)).toEqual(["ok"]);
  });

  /**
   * A razão de a marca d'água existir: sem ela, ligar a automação com a fila
   * cheia despejaria uma sessão por card parado ali desde sempre.
   */
  it("a marca d'água deixa o passado para trás", () => {
    const cards = [
      card("velho", { criadoEm: "2026-10-01T00:00:00Z" }),
      card("novo", { criadoEm: "2026-10-30T11:00:00Z" }),
    ];
    expect(maduros(cards, { desde }).fila.map((c) => c.id)).toEqual(["novo"]);
  });

  it("sem marca d'água, a fila é tudo — é o que `bootstrap` conta antes de gravar", () => {
    const cards = [card("velho", { criadoEm: "2026-10-01T00:00:00Z" }), card("novo")];
    expect(maduros(cards, { desde: null }).fila).toHaveLength(2);
  });

  it("o mais antigo primeiro: quem reportou antes é atendido antes", () => {
    const cards = [
      card("c", { criadoEm: "2026-10-30T12:00:00Z" }),
      card("a", { criadoEm: "2026-10-30T10:00:00Z" }),
      card("b", { criadoEm: "2026-10-30T11:00:00Z" }),
    ];
    expect(maduros(cards, { desde }).fila.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  describe("vagas", () => {
    it("conta como em voo só o que a automação pegou", () => {
      const cards = [
        card("meu", { status: "em_progresso", auto: true }),
        card("teu", { status: "em_progresso" }), // movido à mão: não ocupa vaga
        card("fila"),
      ];
      const r = maduros(cards, { desde, emVooMax: 2 });
      expect(r.emVoo.map((c) => c.id)).toEqual(["meu"]);
      expect(r.vagas).toBe(1);
      expect(r.pegaveis.map((c) => c.id)).toEqual(["fila"]);
    });

    it("com o teto cheio não pega nada, mesmo com fila", () => {
      const cards = [
        card("v1", { status: "em_progresso", auto: true }),
        card("v2", { status: "em_progresso", auto: true }),
        card("esperando"),
      ];
      const r = maduros(cards, { desde, emVooMax: 2 });
      expect(r.vagas).toBe(0);
      expect(r.pegaveis).toEqual([]);
      expect(r.fila.map((c) => c.id)).toEqual(["esperando"]); // continua na fila, não some
    });

    it("estourar o teto não vira vaga negativa", () => {
      const cards = [
        card("v1", { status: "em_progresso", auto: true }),
        card("v2", { status: "em_progresso", auto: true }),
        card("v3", { status: "em_progresso", auto: true }),
      ];
      expect(maduros(cards, { desde, emVooMax: 2 }).vagas).toBe(0);
    });

    it("card em voo que já virou PR continua ocupando a vaga até sair de em_progresso", () => {
      const cards = [
        card("comPR", { status: "em_progresso", auto: true, pr: "adsonpleal/ragcalc#3" }),
        card("fila"),
      ];
      expect(maduros(cards, { desde, emVooMax: 1 }).pegaveis).toEqual([]);
    });
  });
});
