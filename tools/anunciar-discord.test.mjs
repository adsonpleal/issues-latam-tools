import { describe, expect, it } from "vitest";

import { STATUS_LABEL as STATUS_LABEL_APP, TYPE_LABEL as TYPE_LABEL_APP } from "../src/i18n";
import { PROJECTS as PROJECTS_APP } from "../src/lib/projetos";
import {
  PROJECTS,
  STATUS_LABEL,
  TYPE_LABEL,
  buildMessage,
  changeMessage,
  fieldValue,
  freshState,
  isFinalStatus,
  isSaturated,
  orderKey,
  prune,
  pullRequestUrl,
  sanitizeDescription,
  sanitizeTitle,
  stateFromDisk,
  stateToDisk,
  threadName,
  toCard,
  truncate,
} from "./anunciar-discord.mjs";

/**
 * The tool is .mjs with no build step, so it cannot import the app's .ts and
 * duplicates the two tables instead. This is what turns a wrong colour in the
 * embed into a red `npm test`, rather than somebody noticing months later in
 * Discord.
 */
describe("derived from the app's constants", () => {
  it("matches the colours and names in src/lib/projetos.ts", () => {
    expect(Object.keys(PROJECTS).sort()).toEqual(Object.keys(PROJECTS_APP).sort());
    for (const [slug, p] of Object.entries(PROJECTS_APP)) {
      expect(PROJECTS[slug].name).toBe(p.name);
      expect(PROJECTS[slug].color).toBe(p.color);
    }
  });

  it("matches the type labels in src/i18n.ts", () => {
    expect(TYPE_LABEL).toEqual(TYPE_LABEL_APP);
  });

  it("matches the status labels in src/i18n.ts", () => {
    expect(STATUS_LABEL).toEqual(STATUS_LABEL_APP);
  });
});

describe("fieldValue", () => {
  it("unwraps each of REST's types", () => {
    expect(fieldValue({ stringValue: "oi" })).toBe("oi");
    expect(fieldValue({ booleanValue: false })).toBe(false);
    expect(fieldValue({ nullValue: null })).toBe(null);
    expect(fieldValue({ doubleValue: 1.5 })).toBe(1.5);
  });

  it("turns integerValue, which arrives as a string, into a number", () => {
    expect(fieldValue({ integerValue: "42" })).toBe(42);
  });

  it("keeps timestampValue a raw string, never a Date", () => {
    // Going through Date would truncate the microseconds and leave the
    // watermark BEFORE the card it came from, re-announcing it forever.
    const ts = "2026-08-16T18:22:31.412345Z";
    expect(fieldValue({ timestampValue: ts })).toBe(ts);
  });

  it("descends into arrays and maps", () => {
    expect(fieldValue({ arrayValue: { values: [{ stringValue: "a" }] } })).toEqual(["a"]);
    expect(fieldValue({ mapValue: { fields: { n: { integerValue: "7" } } } })).toEqual({ n: 7 });
    expect(fieldValue({ arrayValue: {} })).toEqual([]);
  });

  it("turns a missing or unknown field into null", () => {
    expect(fieldValue(undefined)).toBe(null);
    expect(fieldValue({ geoPointValue: {} })).toBe(null);
  });
});

describe("toCard", () => {
  it("takes the id off the end of name and brings only public fields", () => {
    const card = toCard({
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
    expect(card.project).toBe("calc");
    expect(card.author).toBe(null);
  });

  it("maps every stored field name onto its English one", () => {
    // The left-hand names below are Firestore's and are a contract with the
    // live database; the right-hand ones are this file's. This is the test that
    // catches a rename on the wrong side of that line.
    const card = toCard({
      name: "a/b/c/issues/x",
      fields: {
        projeto: { stringValue: "visuais" },
        tipo: { stringValue: "feature" },
        titulo: { stringValue: "o título" },
        descricao: { stringValue: "a descrição" },
        autor: { stringValue: "RemLATAM" },
        criadoEm: { timestampValue: "2026-08-16T18:22:31Z" },
        status: { stringValue: "backlog" },
        pr: { stringValue: "o/r#1" },
      },
    });
    expect(card).toEqual({
      id: "x",
      project: "visuais",
      type: "feature",
      title: "o título",
      description: "a descrição",
      author: "RemLATAM",
      createdAt: "2026-08-16T18:22:31Z",
      status: "backlog",
      pr: "o/r#1",
    });
  });

  it("survives a document with no fields", () => {
    const card = toCard({ name: "a/b/c/issues/x" });
    expect(card).toMatchObject({ id: "x", title: "", description: "", createdAt: null });
  });
});

describe("orderKey", () => {
  it("sorts a whole second below the same second with a fraction", () => {
    // Raw, "…34Z" > "…34.5Z" lexicographically because 'Z' > '.'. That is the
    // bug that would walk the watermark backwards.
    expect("2026-08-16T22:27:34Z" > "2026-08-16T22:27:34.5Z").toBe(true);
    expect(orderKey("2026-08-16T22:27:34Z") < orderKey("2026-08-16T22:27:34.5Z")).toBe(true);
  });

  it("compares different precisions correctly", () => {
    expect(orderKey("2026-08-16T22:27:34.569Z") < orderKey("2026-08-16T22:27:34.569001Z")).toBe(
      true,
    );
    expect(orderKey("2026-08-16T22:27:34.569Z") === orderKey("2026-08-16T22:27:34.569000Z")).toBe(
      true,
    );
  });

  it("does not blow up on a string outside the format", () => {
    expect(orderKey("qualquer coisa")).toBe("qualquer coisa");
    expect(orderKey(null)).toBe("");
  });
});

describe("truncate", () => {
  it("returns the text intact when it fits", () => {
    expect(truncate("curto", 10)).toBe("curto");
    expect(truncate("exato", 5)).toBe("exato");
  });

  it("backs up to the space so it does not chop a word", () => {
    expect(truncate("um dois tres quatro", 15)).toBe("um dois tres…");
  });

  it("cuts flat when there is no space nearby", () => {
    expect(truncate("a".repeat(100), 10)).toBe(`${"a".repeat(10)}…`);
  });

  it("does not split an emoji in half", () => {
    const cut = truncate(`${"a".repeat(10)}🎉bbb`, 11);
    expect(cut).toBe("aaaaaaaaaa🎉…");
    expect(cut).not.toContain("�");
    // A naive UTF-16 slice would leave half a surrogate pair here.
    expect([...cut].every((c) => c.codePointAt(0) !== 0xd83c)).toBe(true);
  });

  it("counts code points, not UTF-16 units", () => {
    expect(truncate("🎉🎉🎉", 3)).toBe("🎉🎉🎉");
  });
});

describe("sanitizeDescription", () => {
  it("escapes what forms markup", () => {
    expect(sanitizeDescription("**forte** e _fraco_")).toBe("\\*\\*forte\\*\\* e \\_fraco\\_");
    expect(sanitizeDescription("||spoiler||")).toBe("\\|\\|spoiler\\|\\|");
    expect(sanitizeDescription("`code`")).toBe("\\`code\\`");
  });

  it("takes a masked link apart without swallowing the parenthesis", () => {
    expect(sanitizeDescription("[clique](http://ruim)")).toBe("\\[clique\\]([link])");
  });

  it("leaves the punctuation that closes a sentence in place", () => {
    expect(sanitizeDescription("olha https://x.com/a, e https://y.com.")).toBe("olha [link], e [link].");
  });

  it("neutralises a heading at the start of a line", () => {
    expect(sanitizeDescription("# titulo falso")).toBe("\\# titulo falso");
  });

  it("strips URLs and Discord invites", () => {
    expect(sanitizeDescription("veja https://phishing.example/x")).toBe("veja [link]");
    expect(sanitizeDescription("entra discord.gg/abc agora")).toBe("entra [link] agora");
    expect(sanitizeDescription("www.ruim.com")).toBe("[link]");
  });

  it("strips invisibles, bidi and zero-width", () => {
    expect(sanitizeDescription("a​b‮cd")).toBe("abcd");
  });

  it("does not let the user inject the link sentinel", () => {
    // If the sentinel survived, a "[link]" could be forged mid-text.
    expect(sanitizeDescription("ab")).toBe("ab");
  });

  it("escapes a raw mention (allowed_mentions covers the ping)", () => {
    expect(sanitizeDescription("<@1234>")).toBe("\\<@1234\\>");
  });

  it("collapses blank lines and caps the height", () => {
    expect(sanitizeDescription("a\n\n\n\n\nb")).toBe("a\n\nb");
    expect(sanitizeDescription(Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n"))).toBe(
      Array.from({ length: 8 }, (_, i) => `l${i}`).join("\n"),
    );
  });

  it("survives empty and non-string input", () => {
    expect(sanitizeDescription("")).toBe("");
    expect(sanitizeDescription(null)).toBe("");
  });
});

describe("sanitizeTitle", () => {
  it("does not escape markdown (an embed title does not render it)", () => {
    expect(sanitizeTitle("bug no **item**")).toBe("bug no **item**");
  });

  it("joins whitespace and strips invisibles", () => {
    expect(sanitizeTitle("  a\n\nb​  ")).toBe("a b");
  });
});

describe("buildMessage", () => {
  const base = {
    id: "abc123",
    project: "mercado",
    type: "bug",
    title: "Falta a carta",
    description: "Não aparece na lista",
    author: null,
    createdAt: "2026-08-16T18:22:31.412345Z",
  };

  it("builds the embed with the project's colour and the permalink", () => {
    const m = buildMessage(base);
    expect(m.embeds[0]).toMatchObject({
      author: { name: "Mercado · Bug" },
      title: "Falta a carta",
      url: "https://issues.latam-tools.com.br/t/abc123",
      color: 0x3fa96c,
      description: "Não aparece na lista",
      timestamp: "2026-08-16T18:22:31.412345Z",
    });
  });

  it("never lets a mass mention through", () => {
    expect(buildMessage({ ...base, title: "@everyone socorro" }).allowed_mentions).toEqual({
      parse: [],
    });
  });

  it("puts the nickname in the footer only when there is one", () => {
    expect(buildMessage(base).embeds[0].footer.text).toBe("issues.latam-tools.com.br");
    expect(buildMessage({ ...base, author: "RemLATAM" }).embeds[0].footer.text).toBe(
      "Reportado por RemLATAM · issues.latam-tools.com.br",
    );
  });

  it("does not let a nickname with invisibles forge a footer", () => {
    expect(buildMessage({ ...base, author: "Rem‮X" }).embeds[0].footer.text).toBe(
      "Reportado por RemX · issues.latam-tools.com.br",
    );
  });

  it("falls back to blurple for an unknown project instead of breaking", () => {
    // Same philosophy as parseProject: an old slug does not take the page down.
    const m = buildMessage({ ...base, project: "novo", type: "bug" });
    expect(m.embeds[0].color).toBe(0x5865f2);
    expect(m.embeds[0].author.name).toBe("novo · Bug");
  });

  it("omits the description when the card has none", () => {
    expect(buildMessage({ ...base, description: "" }).embeds[0]).not.toHaveProperty("description");
  });

  it("does not produce a titleless embed from an empty title", () => {
    expect(buildMessage({ ...base, title: "" }).embeds[0].title).toBe("(sem título)");
  });

  it("escapes the id as a URL component", () => {
    expect(buildMessage({ ...base, id: "a b/c" }).embeds[0].url).toBe(
      "https://issues.latam-tools.com.br/t/a%20b%2Fc",
    );
  });

  it("keeps the nonce stable per card, so Discord deduplicates a repeat", () => {
    expect(buildMessage(base).nonce).toBe(buildMessage(base).nonce);
    expect(buildMessage(base).nonce.length).toBeLessThanOrEqual(25);
    expect(buildMessage({ ...base, id: "outro" }).nonce).not.toBe(buildMessage(base).nonce);
  });

  it("respects Discord's size limits", () => {
    const m = buildMessage({ ...base, title: "t".repeat(500), description: "d".repeat(5000) });
    expect([...m.embeds[0].title].length).toBeLessThanOrEqual(201);
    expect([...m.embeds[0].description].length).toBeLessThanOrEqual(501);
  });
});

describe("toCard brings status and pr", () => {
  it("carries the two fields the follow-up uses", () => {
    const card = toCard({
      name: "a/b/c/issues/x",
      fields: { status: { stringValue: "em_progresso" }, pr: { stringValue: "o/r#7" } },
    });
    expect(card.status).toBe("em_progresso");
    expect(card.pr).toBe("o/r#7");
  });

  it("gives the card exactly these keys and no more", () => {
    // Pins the promise in the script's header: what comes out of here is what
    // goes to Discord. A new key gets in through this test, not by accident.
    expect(Object.keys(toCard({ name: "a/b/c/issues/x" })).sort()).toEqual([
      "author",
      "createdAt",
      "description",
      "id",
      "pr",
      "project",
      "status",
      "title",
      "type",
    ]);
  });
});

/**
 * The state file lives in /var/lib on the server and was written by the
 * version of this script that is deployed now. Its keys are as much a contract
 * as Firestore's field names: `readState` rejects a shape it does not
 * recognise, renames the file and redoes the bootstrap, which silently drops
 * the announcements in that window. These tests are what stop a rename from
 * reaching disk.
 */
describe("the state file's on-disk shape", () => {
  const onDisk = {
    versao: 1,
    watermark: "2026-08-16T18:22:31.412345Z",
    anunciados: ["a", "b"],
    falhasSeguidas: 3,
    alertaEnviado: true,
    acompanhados: { card1: { topico: "t1", mensagem: "m1", pr: "o/r#2", status: "backlog" } },
    ultimaChecagem: 1762000000000,
  };

  it("reads the stored keys into English ones", () => {
    expect(stateFromDisk(onDisk)).toEqual({
      version: 1,
      watermark: "2026-08-16T18:22:31.412345Z",
      announced: ["a", "b"],
      consecutiveFailures: 3,
      alertSent: true,
      followed: { card1: { threadId: "t1", messageId: "m1", pr: "o/r#2", status: "backlog" } },
      lastCheck: 1762000000000,
    });
  });

  it("writes back exactly the keys the server already holds", () => {
    expect(stateToDisk(stateFromDisk(onDisk))).toEqual(onDisk);
  });

  it("writes those same keys for a state that never came off disk", () => {
    // The bootstrap path builds a state in memory; it must land on disk in the
    // shape the deployed reader demands.
    expect(Object.keys(stateToDisk(freshState("2026-01-01T00:00:00Z"))).sort()).toEqual([
      "acompanhados",
      "alertaEnviado",
      "anunciados",
      "falhasSeguidas",
      "ultimaChecagem",
      "versao",
      "watermark",
    ]);
    expect(stateToDisk(freshState("2026-01-01T00:00:00Z")).versao).toBe(1);
  });

  it("treats a state file written before follow-ups existed as valid", () => {
    const old = { versao: 1, watermark: "2026-01-01T00:00:00Z", anunciados: ["a"] };
    expect(stateFromDisk(old)).toMatchObject({
      followed: {},
      lastCheck: 0,
      consecutiveFailures: 0,
      alertSent: false,
    });
  });
});

describe("pullRequestUrl", () => {
  it("builds the link from owner/repo#N", () => {
    expect(pullRequestUrl("adsonpleal/latam-ro-calc#90")).toBe(
      "https://github.com/adsonpleal/latam-ro-calc/pull/90",
    );
  });

  it("refuses anything outside the format", () => {
    // The field is data, not code: what does not match exactly becomes no link
    // at all, because this link is posted under the bot's identity.
    for (const bad of ["", "sem-numero", "o/r#", "o/r#abc", "http://evil.com", "o/r#1 extra", null, 7]) {
      expect(pullRequestUrl(bad)).toBe(null);
    }
  });

  it("does not let an extra slash become another path", () => {
    expect(pullRequestUrl("a/b/c#1")).toBe(null);
  });
});

describe("isSaturated", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  const card = (minutesAgo) => ({
    createdAt: new Date(now - minutesAgo * 60000).toISOString(),
  });

  it("saturates on a burst inside the window", () => {
    expect(isSaturated(Array.from({ length: 10 }, () => card(1)), { now })).toBe(true);
  });

  it("does NOT saturate on a backlog spread over days", () => {
    // This is the regression that left the service 13 days red: a full page
    // fired the guard, the guard blocked the post, and with no post the
    // watermark never moved.
    const behind = Array.from({ length: 26 }, (_, i) => card((i + 1) * 60 * 12));
    expect(isSaturated(behind, { now })).toBe(false);
  });

  it("does not count a card with no date", () => {
    expect(isSaturated([{ createdAt: null }, { createdAt: "nao e data" }], { now })).toBe(false);
  });
});

describe("changeMessage", () => {
  it("announces the pull request when it appears", () => {
    const m = changeMessage({ pr: null, status: "em_progresso" }, { pr: "o/r#3", status: "em_progresso" });
    expect(m.content).toContain("https://github.com/o/r/pull/3");
    expect(m.allowed_mentions).toEqual({ parse: [] });
  });

  it("announces a status move with the site's own label", () => {
    const m = changeMessage({ pr: null, status: "reportado" }, { pr: null, status: "resolvido" });
    expect(m.content).toContain("Resolvido");
  });

  it("joins the two when they change together", () => {
    const m = changeMessage(
      { pr: null, status: "reportado" },
      { pr: "o/r#3", status: "em_progresso" },
    );
    expect(m.content).toContain("https://github.com/o/r/pull/3");
    expect(m.content).toContain("Em progresso");
  });

  it("posts nothing when nothing changed", () => {
    const same = { pr: "o/r#3", status: "em_progresso" };
    expect(changeMessage(same, { ...same })).toBe(null);
  });

  it("does not turn a malformed PR into a line", () => {
    expect(changeMessage({ pr: null, status: "x" }, { pr: "lixo", status: "x" })).toBe(null);
  });
});

describe("prune", () => {
  it("returns the list intact when it fits", () => {
    const a = { um: 1, dois: 2 };
    expect(prune(a, 5)).toEqual(a);
  });

  it("keeps the newest and drops the oldest", () => {
    expect(Object.keys(prune({ a: 1, b: 2, c: 3 }, 2))).toEqual(["b", "c"]);
  });

  it("survives empty and missing input", () => {
    expect(prune(undefined, 2)).toEqual({});
  });
});

describe("thread name and final status", () => {
  it("names the thread with the sanitised title, cut at 100", () => {
    expect([...threadName({ title: "t".repeat(300) })].length).toBeLessThanOrEqual(100);
    expect(threadName({ title: "" })).toBe("(sem título)");
  });

  it("ends the follow-up only on resolvido and nao_sera_feito", () => {
    expect(isFinalStatus("resolvido")).toBe(true);
    expect(isFinalStatus("nao_sera_feito")).toBe(true);
    for (const open of ["reportado", "backlog", "em_progresso", null, undefined]) {
      expect(isFinalStatus(open)).toBe(false);
    }
  });
});
