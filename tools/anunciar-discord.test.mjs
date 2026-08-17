import { describe, expect, it } from "vitest";

import { LABEL_TIPO as LABEL_TIPO_APP } from "../src/i18n";
import { PROJETOS as PROJETOS_APP } from "../src/lib/projetos";
import {
  LABEL_TIPO,
  PROJETOS,
  chaveOrdem,
  documentoParaCard,
  montarMensagem,
  sanitizarDescricao,
  sanitizarTitulo,
  truncar,
  valor,
} from "./anunciar-discord.mjs";

/**
 * A ferramenta é .mjs sem build, então não consegue importar o .ts do app e
 * duplica as duas tabelas. Isto é o que transforma uma cor errada no embed em
 * `npm test` vermelho, em vez de alguém reparar meses depois no Discord.
 */
describe("deriva das constantes", () => {
  it("as cores e nomes batem com src/lib/projetos.ts", () => {
    expect(Object.keys(PROJETOS).sort()).toEqual(Object.keys(PROJETOS_APP).sort());
    for (const [slug, p] of Object.entries(PROJETOS_APP)) {
      expect(PROJETOS[slug].nome).toBe(p.nome);
      expect(PROJETOS[slug].cor).toBe(p.cor);
    }
  });

  it("os rótulos de tipo batem com src/i18n.ts", () => {
    expect(LABEL_TIPO).toEqual(LABEL_TIPO_APP);
  });
});

describe("valor", () => {
  it("desembrulha cada tipo da REST", () => {
    expect(valor({ stringValue: "oi" })).toBe("oi");
    expect(valor({ booleanValue: false })).toBe(false);
    expect(valor({ nullValue: null })).toBe(null);
    expect(valor({ doubleValue: 1.5 })).toBe(1.5);
  });

  it("integerValue chega como string e vira número", () => {
    expect(valor({ integerValue: "42" })).toBe(42);
  });

  it("timestampValue fica string crua, nunca Date", () => {
    // Passar por Date truncaria os microssegundos e o marco d'água ficaria
    // ANTES do card de onde veio, reanunciando-o para sempre.
    const ts = "2026-08-16T18:22:31.412345Z";
    expect(valor({ timestampValue: ts })).toBe(ts);
  });

  it("desce em array e map", () => {
    expect(valor({ arrayValue: { values: [{ stringValue: "a" }] } })).toEqual(["a"]);
    expect(valor({ mapValue: { fields: { n: { integerValue: "7" } } } })).toEqual({ n: 7 });
    expect(valor({ arrayValue: {} })).toEqual([]);
  });

  it("campo ausente ou desconhecido vira null", () => {
    expect(valor(undefined)).toBe(null);
    expect(valor({ geoPointValue: {} })).toBe(null);
  });
});

describe("documentoParaCard", () => {
  it("tira o id do fim do name e traz só campo público", () => {
    const card = documentoParaCard({
      name: "projects/p/databases/(default)/documents/issues/abc123",
      fields: {
        projeto: { stringValue: "calc" },
        tipo: { stringValue: "bug" },
        titulo: { stringValue: "t" },
        descricao: { stringValue: "d" },
        criadoEm: { timestampValue: "2026-08-16T18:22:31Z" },
      },
    });
    expect(card.id).toBe("abc123");
    expect(card.projeto).toBe("calc");
    expect(card.autor).toBe(null);
  });

  it("aguenta documento sem campos", () => {
    const card = documentoParaCard({ name: "a/b/c/issues/x" });
    expect(card).toMatchObject({ id: "x", titulo: "", descricao: "", criadoEm: null });
  });
});

describe("chaveOrdem", () => {
  it("segundo cheio é menor que o mesmo segundo com fração", () => {
    // Cru, "…34Z" > "…34.5Z" no lexicográfico porque 'Z' > '.'. É o bug que
    // faria o marco andar para trás.
    expect("2026-08-16T22:27:34Z" > "2026-08-16T22:27:34.5Z").toBe(true);
    expect(chaveOrdem("2026-08-16T22:27:34Z") < chaveOrdem("2026-08-16T22:27:34.5Z")).toBe(true);
  });

  it("compara precisões diferentes corretamente", () => {
    expect(chaveOrdem("2026-08-16T22:27:34.569Z") < chaveOrdem("2026-08-16T22:27:34.569001Z")).toBe(
      true,
    );
    expect(chaveOrdem("2026-08-16T22:27:34.569Z") === chaveOrdem("2026-08-16T22:27:34.569000Z")).toBe(
      true,
    );
  });

  it("string fora do formato não explode", () => {
    expect(chaveOrdem("qualquer coisa")).toBe("qualquer coisa");
    expect(chaveOrdem(null)).toBe("");
  });
});

describe("truncar", () => {
  it("devolve intacto quando cabe", () => {
    expect(truncar("curto", 10)).toBe("curto");
    expect(truncar("exato", 5)).toBe("exato");
  });

  it("recua até o espaço para não picar a palavra", () => {
    expect(truncar("um dois tres quatro", 15)).toBe("um dois tres…");
  });

  it("corta seco quando não há espaço por perto", () => {
    expect(truncar("a".repeat(100), 10)).toBe(`${"a".repeat(10)}…`);
  });

  it("não parte emoji ao meio", () => {
    const cortado = truncar(`${"a".repeat(10)}🎉bbb`, 11);
    expect(cortado).toBe("aaaaaaaaaa🎉…");
    expect(cortado).not.toContain("�");
    // Um slice ingênuo por UTF-16 deixaria metade do par substituto aqui.
    expect([...cortado].every((c) => c.codePointAt(0) !== 0xd83c)).toBe(true);
  });

  it("conta code point, não unidade UTF-16", () => {
    expect(truncar("🎉🎉🎉", 3)).toBe("🎉🎉🎉");
  });
});

describe("sanitizarDescricao", () => {
  it("escapa o que forma markup", () => {
    expect(sanitizarDescricao("**forte** e _fraco_")).toBe("\\*\\*forte\\*\\* e \\_fraco\\_");
    expect(sanitizarDescricao("||spoiler||")).toBe("\\|\\|spoiler\\|\\|");
    expect(sanitizarDescricao("`code`")).toBe("\\`code\\`");
  });

  it("desmonta link mascarado sem levar o parêntese junto", () => {
    expect(sanitizarDescricao("[clique](http://ruim)")).toBe("\\[clique\\]([link])");
  });

  it("deixa a pontuação que fecha a frase no lugar", () => {
    expect(sanitizarDescricao("olha https://x.com/a, e https://y.com.")).toBe("olha [link], e [link].");
  });

  it("neutraliza cabeçalho no começo da linha", () => {
    expect(sanitizarDescricao("# titulo falso")).toBe("\\# titulo falso");
  });

  it("tira URL e convite do Discord", () => {
    expect(sanitizarDescricao("veja https://phishing.example/x")).toBe("veja [link]");
    expect(sanitizarDescricao("entra discord.gg/abc agora")).toBe("entra [link] agora");
    expect(sanitizarDescricao("www.ruim.com")).toBe("[link]");
  });

  it("tira invisível, bidi e zero-width", () => {
    expect(sanitizarDescricao("a​b‮cd")).toBe("abcd");
  });

  it("não deixa o usuário injetar a sentinela de link", () => {
    // Se a sentinela sobrevivesse, daria para forjar um "[link]" no meio do texto.
    expect(sanitizarDescricao("ab")).toBe("ab");
  });

  it("escapa menção crua (o allowed_mentions cobre o ping)", () => {
    expect(sanitizarDescricao("<@1234>")).toBe("\\<@1234\\>");
  });

  it("colapsa linha em branco e limita a altura", () => {
    expect(sanitizarDescricao("a\n\n\n\n\nb")).toBe("a\n\nb");
    expect(sanitizarDescricao(Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n"))).toBe(
      Array.from({ length: 8 }, (_, i) => `l${i}`).join("\n"),
    );
  });

  it("aguenta vazio e não-string", () => {
    expect(sanitizarDescricao("")).toBe("");
    expect(sanitizarDescricao(null)).toBe("");
  });
});

describe("sanitizarTitulo", () => {
  it("não escapa markdown (título de embed não renderiza)", () => {
    expect(sanitizarTitulo("bug no **item**")).toBe("bug no **item**");
  });

  it("junta espaço e tira invisível", () => {
    expect(sanitizarTitulo("  a\n\nb​  ")).toBe("a b");
  });
});

describe("montarMensagem", () => {
  const base = {
    id: "abc123",
    projeto: "mercado",
    tipo: "bug",
    titulo: "Falta a carta",
    descricao: "Não aparece na lista",
    autor: null,
    criadoEm: "2026-08-16T18:22:31.412345Z",
  };

  it("monta o embed com cor do projeto e permalink", () => {
    const m = montarMensagem(base);
    expect(m.embeds[0]).toMatchObject({
      author: { name: "Mercado · Bug" },
      title: "Falta a carta",
      url: "https://issues.latam-tools.com.br/t/abc123",
      color: 0x3fa96c,
      description: "Não aparece na lista",
      timestamp: "2026-08-16T18:22:31.412345Z",
    });
  });

  it("nunca deixa passar menção em massa", () => {
    expect(montarMensagem({ ...base, titulo: "@everyone socorro" }).allowed_mentions).toEqual({
      parse: [],
    });
  });

  it("põe o nick no rodapé só quando existe", () => {
    expect(montarMensagem(base).embeds[0].footer.text).toBe("issues.latam-tools.com.br");
    expect(montarMensagem({ ...base, autor: "RemLATAM" }).embeds[0].footer.text).toBe(
      "Reportado por RemLATAM · issues.latam-tools.com.br",
    );
  });

  it("nick com invisível não vira rodapé forjado", () => {
    expect(montarMensagem({ ...base, autor: "Rem‮X" }).embeds[0].footer.text).toBe(
      "Reportado por RemX · issues.latam-tools.com.br",
    );
  });

  it("projeto desconhecido cai no blurple em vez de quebrar", () => {
    // Mesma filosofia do parseProjeto: slug velho não derruba a página.
    const m = montarMensagem({ ...base, projeto: "novo", tipo: "bug" });
    expect(m.embeds[0].color).toBe(0x5865f2);
    expect(m.embeds[0].author.name).toBe("novo · Bug");
  });

  it("omite a descrição quando o card não tem", () => {
    expect(montarMensagem({ ...base, descricao: "" }).embeds[0]).not.toHaveProperty("description");
  });

  it("título vazio não gera embed sem título", () => {
    expect(montarMensagem({ ...base, titulo: "" }).embeds[0].title).toBe("(sem título)");
  });

  it("id vira componente de URL escapado", () => {
    expect(montarMensagem({ ...base, id: "a b/c" }).embeds[0].url).toBe(
      "https://issues.latam-tools.com.br/t/a%20b%2Fc",
    );
  });

  it("nonce é estável por card, para o Discord deduplicar a repetição", () => {
    expect(montarMensagem(base).nonce).toBe(montarMensagem(base).nonce);
    expect(montarMensagem(base).nonce.length).toBeLessThanOrEqual(25);
    expect(montarMensagem({ ...base, id: "outro" }).nonce).not.toBe(montarMensagem(base).nonce);
  });

  it("respeita os limites de tamanho do Discord", () => {
    const m = montarMensagem({ ...base, titulo: "t".repeat(500), descricao: "d".repeat(5000) });
    expect([...m.embeds[0].title].length).toBeLessThanOrEqual(201);
    expect([...m.embeds[0].description].length).toBeLessThanOrEqual(501);
  });
});
