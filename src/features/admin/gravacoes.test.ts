import { describe, expect, it } from "vitest";

import type { Recording } from "../../lib/gravacoes";
import { formatDuration, summaryRows, splitRecordings } from "./gravacoes";

function recording(over: Partial<Recording> & { id: string }): Recording {
  return {
    title: "Gravação: Executor nv 240/50",
    notes: "",
    summary: {},
    nick: null,
    contact: null,
    fileName: "sessao.rrf",
    size: 80_000,
    createdAt: new Date("2026-01-01"),
    state: "fila",
    issueId: null,
    decidedAt: null,
    triageNote: null,
    ...over,
  };
}

describe("separarGravacoes", () => {
  it("separa as três pilhas pelo estado", () => {
    const r = splitRecordings([
      recording({ id: "nova" }),
      recording({ id: "publicada", state: "promovida", issueId: "publicada" }),
      recording({ id: "conferida", state: "conferida" }),
      recording({ id: "descartada", state: "descartada" }),
    ]);
    expect(r.queue.map((g) => g.id)).toEqual(["nova"]);
    expect(r.promovidas.map((g) => g.id)).toEqual(["publicada"]);
    // Conferida e descartada são as duas formas de fechar sem publicar.
    expect(r.decididas.map((g) => g.id).sort()).toEqual(["conferida", "descartada"]);
  });

  it("fila ordena pela chegada e decididas pelo carimbo", () => {
    const r = splitRecordings([
      recording({ id: "velha", createdAt: new Date("2026-01-01") }),
      recording({ id: "nova", createdAt: new Date("2026-06-01") }),
      recording({
        id: "fechada-antes",
        state: "descartada",
        decidedAt: new Date("2026-02-01"),
      }),
      recording({
        id: "fechada-agora",
        state: "conferida",
        decidedAt: new Date("2026-08-01"),
      }),
    ]);
    expect(r.queue.map((g) => g.id)).toEqual(["nova", "velha"]);
    expect(r.decididas.map((g) => g.id)).toEqual(["fechada-agora", "fechada-antes"]);
  });
});

describe("formataDuracao", () => {
  it("converte milissegundos em minutos e segundos", () => {
    expect(formatDuration(133_400)).toBe("2m 13s");
    expect(formatDuration(45_000)).toBe("45s");
  });

  it("devolve null para o que não dá para mostrar", () => {
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration("2m")).toBeNull();
  });
});

describe("linhasDoResumo", () => {
  it("mostra o essencial mesmo com o resumo vazio", () => {
    const chaves = summaryRows({}).map((l) => l.chave);
    expect(chaves).toEqual(["personagem", "golpes", "trocas", "versao"]);
  });

  it("acrescenta as linhas opcionais quando o parser as trouxe", () => {
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
    const por = Object.fromEntries(rows.map((l) => [l.chave, l]));
    expect(por["personagem"]?.value).toBe("Mestre Ferreiro — Bigorna (nv 175/60)");
    expect(por["golpes"]?.value).toBe("40 em dummy · 52 no total");
    expect(por["talentos"]?.value).toBe("POW 10 · CON 5");
    expect(por["talentos"]?.help).toBe("lidos da gravação");
    expect(por["itens"]?.value).toBe("1234, 5678");
    expect(por["duracao"]?.value).toBe("1m 30s");
    expect(por["arquivo"]?.value).toBe("sessao.rrf");
  });

  it("versão vazia da migração vira interrogação, não linha em branco", () => {
    expect(summaryRows({ appVersion: "" }).find((l) => l.chave === "versao")?.value).toBe("?");
  });
});
