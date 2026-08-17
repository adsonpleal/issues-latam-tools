import { describe, expect, it } from "vitest";

import type { Gravacao } from "../../lib/gravacoes";
import { formataDuracao, linhasDoResumo, separarGravacoes } from "./gravacoes";

function gravacao(over: Partial<Gravacao> & { id: string }): Gravacao {
  return {
    titulo: "Gravação: Executor nv 240/50",
    notas: "",
    resumo: {},
    nick: null,
    contato: null,
    nome: "sessao.rrf",
    tamanho: 80_000,
    criadoEm: new Date("2026-01-01"),
    estado: "fila",
    issueId: null,
    decididaEm: null,
    notaTriagem: null,
    ...over,
  };
}

describe("separarGravacoes", () => {
  it("separa as três pilhas pelo estado", () => {
    const r = separarGravacoes([
      gravacao({ id: "nova" }),
      gravacao({ id: "publicada", estado: "promovida", issueId: "publicada" }),
      gravacao({ id: "conferida", estado: "conferida" }),
      gravacao({ id: "descartada", estado: "descartada" }),
    ]);
    expect(r.fila.map((g) => g.id)).toEqual(["nova"]);
    expect(r.promovidas.map((g) => g.id)).toEqual(["publicada"]);
    // Conferida e descartada são as duas formas de fechar sem publicar.
    expect(r.decididas.map((g) => g.id).sort()).toEqual(["conferida", "descartada"]);
  });

  it("fila ordena pela chegada e decididas pelo carimbo", () => {
    const r = separarGravacoes([
      gravacao({ id: "velha", criadoEm: new Date("2026-01-01") }),
      gravacao({ id: "nova", criadoEm: new Date("2026-06-01") }),
      gravacao({
        id: "fechada-antes",
        estado: "descartada",
        decididaEm: new Date("2026-02-01"),
      }),
      gravacao({
        id: "fechada-agora",
        estado: "conferida",
        decididaEm: new Date("2026-08-01"),
      }),
    ]);
    expect(r.fila.map((g) => g.id)).toEqual(["nova", "velha"]);
    expect(r.decididas.map((g) => g.id)).toEqual(["fechada-agora", "fechada-antes"]);
  });
});

describe("formataDuracao", () => {
  it("converte milissegundos em minutos e segundos", () => {
    expect(formataDuracao(133_400)).toBe("2m 13s");
    expect(formataDuracao(45_000)).toBe("45s");
  });

  it("devolve null para o que não dá para mostrar", () => {
    expect(formataDuracao(0)).toBeNull();
    expect(formataDuracao(undefined)).toBeNull();
    expect(formataDuracao("2m")).toBeNull();
  });
});

describe("linhasDoResumo", () => {
  it("mostra o essencial mesmo com o resumo vazio", () => {
    const chaves = linhasDoResumo({}).map((l) => l.chave);
    expect(chaves).toEqual(["personagem", "golpes", "trocas", "versao"]);
  });

  it("acrescenta as linhas opcionais quando o parser as trouxe", () => {
    const linhas = linhasDoResumo({
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
    const por = Object.fromEntries(linhas.map((l) => [l.chave, l]));
    expect(por["personagem"]?.valor).toBe("Mestre Ferreiro — Bigorna (nv 175/60)");
    expect(por["golpes"]?.valor).toBe("40 em dummy · 52 no total");
    expect(por["talentos"]?.valor).toBe("POW 10 · CON 5");
    expect(por["talentos"]?.ajuda).toBe("lidos da gravação");
    expect(por["itens"]?.valor).toBe("1234, 5678");
    expect(por["duracao"]?.valor).toBe("1m 30s");
    expect(por["arquivo"]?.valor).toBe("sessao.rrf");
  });

  it("versão vazia da migração vira interrogação, não linha em branco", () => {
    expect(linhasDoResumo({ appVersion: "" }).find((l) => l.chave === "versao")?.valor).toBe("?");
  });
});
