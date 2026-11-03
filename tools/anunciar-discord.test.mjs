import { describe, expect, it } from "vitest";

import { LABEL_STATUS as LABEL_STATUS_APP, LABEL_TIPO as LABEL_TIPO_APP } from "../src/i18n";
import { PROJETOS as PROJETOS_APP } from "../src/lib/projetos";
import {
  LABEL_STATUS,
  LABEL_TIPO,
  PROJETOS,
  chaveOrdem,
  documentoParaCard,
  mensagemDeMudanca,
  montarMensagem,
  nomeDoTopico,
  podar,
  sanitizarDescricao,
  sanitizarTitulo,
  saturado,
  statusFinal,
  truncar,
  urlDoPr,
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

  it("os rótulos de status batem com src/i18n.ts", () => {
    expect(LABEL_STATUS).toEqual(LABEL_STATUS_APP);
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

describe("documentoParaCard traz status e pr", () => {
  it("carrega os dois campos que o acompanhamento usa", () => {
    const card = documentoParaCard({
      name: "a/b/c/issues/x",
      fields: { status: { stringValue: "em_progresso" }, pr: { stringValue: "o/r#7" } },
    });
    expect(card.status).toBe("em_progresso");
    expect(card.pr).toBe("o/r#7");
  });

  it("o card tem exatamente estas chaves, e nenhuma a mais", () => {
    // Trava a promessa do cabecalho do script: o que sai daqui e o que vai para
    // o Discord. Uma chave nova entra por este teste, nao por descuido.
    expect(Object.keys(documentoParaCard({ name: "a/b/c/issues/x" })).sort()).toEqual([
      "autor",
      "criadoEm",
      "descricao",
      "id",
      "pr",
      "projeto",
      "status",
      "tipo",
      "titulo",
    ]);
  });
});

describe("urlDoPr", () => {
  it("monta o link a partir de dono/repo#N", () => {
    expect(urlDoPr("adsonpleal/latam-ro-calc#90")).toBe(
      "https://github.com/adsonpleal/latam-ro-calc/pull/90",
    );
  });

  it("recusa qualquer coisa fora do formato", () => {
    // O campo e dado, nao codigo: o que nao casa exato nao vira link nenhum,
    // porque este link e postado sob a identidade do bot.
    for (const ruim of ["", "sem-numero", "o/r#", "o/r#abc", "http://evil.com", "o/r#1 extra", null, 7]) {
      expect(urlDoPr(ruim)).toBe(null);
    }
  });

  it("nao deixa barra a mais virar outro caminho", () => {
    expect(urlDoPr("a/b/c#1")).toBe(null);
  });
});

describe("saturado", () => {
  const agora = Date.parse("2026-11-03T12:00:00Z");
  const card = (minutosAtras) => ({
    criadoEm: new Date(agora - minutosAtras * 60000).toISOString(),
  });

  it("rajada na janela satura", () => {
    expect(saturado(Array.from({ length: 10 }, () => card(1)), { agora })).toBe(true);
  });

  it("represamento espalhado por dias NAO satura", () => {
    // Esta e a regressao que deixou o servico 13 dias vermelho: a pagina cheia
    // disparava o guard, o guard impedia o post, e sem post o marco nao andava.
    const atrasados = Array.from({ length: 26 }, (_, i) => card((i + 1) * 60 * 12));
    expect(saturado(atrasados, { agora })).toBe(false);
  });

  it("card sem data nao conta", () => {
    expect(saturado([{ criadoEm: null }, { criadoEm: "nao e data" }], { agora })).toBe(false);
  });
});

describe("mensagemDeMudanca", () => {
  it("anuncia o PR quando ele aparece", () => {
    const m = mensagemDeMudanca({ pr: null, status: "em_progresso" }, { pr: "o/r#3", status: "em_progresso" });
    expect(m.content).toContain("https://github.com/o/r/pull/3");
    expect(m.allowed_mentions).toEqual({ parse: [] });
  });

  it("anuncia a mudanca de status com o rotulo do site", () => {
    const m = mensagemDeMudanca({ pr: null, status: "reportado" }, { pr: null, status: "resolvido" });
    expect(m.content).toContain("Resolvido");
  });

  it("junta as duas quando mudam juntas", () => {
    const m = mensagemDeMudanca(
      { pr: null, status: "reportado" },
      { pr: "o/r#3", status: "em_progresso" },
    );
    expect(m.content).toContain("https://github.com/o/r/pull/3");
    expect(m.content).toContain("Em progresso");
  });

  it("sem mudanca, nao posta nada", () => {
    const igual = { pr: "o/r#3", status: "em_progresso" };
    expect(mensagemDeMudanca(igual, { ...igual })).toBe(null);
  });

  it("PR malformado nao vira linha", () => {
    expect(mensagemDeMudanca({ pr: null, status: "x" }, { pr: "lixo", status: "x" })).toBe(null);
  });
});

describe("podar", () => {
  it("devolve intacto quando cabe", () => {
    const a = { um: 1, dois: 2 };
    expect(podar(a, 5)).toEqual(a);
  });

  it("mantem os mais novos e descarta os mais velhos", () => {
    expect(Object.keys(podar({ a: 1, b: 2, c: 3 }, 2))).toEqual(["b", "c"]);
  });

  it("aguenta vazio e ausente", () => {
    expect(podar(undefined, 2)).toEqual({});
  });
});

describe("tópico e status final", () => {
  it("o nome do topico e o titulo saneado e cortado em 100", () => {
    expect([...nomeDoTopico({ titulo: "t".repeat(300) })].length).toBeLessThanOrEqual(100);
    expect(nomeDoTopico({ titulo: "" })).toBe("(sem título)");
  });

  it("so resolvido e nao_sera_feito encerram o acompanhamento", () => {
    expect(statusFinal("resolvido")).toBe(true);
    expect(statusFinal("nao_sera_feito")).toBe(true);
    for (const aberto of ["reportado", "backlog", "em_progresso", null, undefined]) {
      expect(statusFinal(aberto)).toBe(false);
    }
  });
});
