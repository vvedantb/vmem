import { describe, expect, it } from "vitest";
import {
  contentTokens,
  hasWholeWord,
  tokenize,
} from "../../engine/memory/tokens";
import { queryEmbeddingText } from "../../engine/memory/synonyms";

describe("tokenize", () => {
  it("keeps ascii words and drops punctuation", () => {
    expect(tokenize("Use pnpm!")).toEqual(["use", "pnpm"]);
  });

  it("keeps unicode letters and digits", () => {
    expect(tokenize("الشاي الأخضر")).toEqual(["الشاي", "الأخضر"]);
    expect(tokenize("你好 世界")).toEqual(["你好", "世界"]);
    expect(tokenize("שלום 42")).toEqual(["שלום", "42"]);
  });

  it("drops emoji so lexical matching can fall back to substring", () => {
    expect(tokenize("🔥 pnpm")).toEqual(["pnpm"]);
    expect(tokenize("🔥")).toEqual([]);
  });

  it("keeps the original token and camelCase / digit pieces", () => {
    expect(tokenize("HeliosRun")).toEqual(["heliosrun", "helios", "run"]);
    expect(tokenize("K8S-ERR-9f3a")).toContain("9f3a");
    expect(tokenize("E2001")).toEqual(["e2001", "2001"]);
  });
});

describe("hasWholeWord", () => {
  it("matches Helios as a whole word but not inside HeliosRun", () => {
    expect(hasWholeWord("Asha is DRI for Helios", "helios")).toBe(true);
    expect(hasWholeWord("Benno is DRI for HeliosRun", "helios")).toBe(false);
  });
});

describe("queryEmbeddingText", () => {
  it("appends expanded terms so package-manager queries overlap pnpm docs", () => {
    const text = queryEmbeddingText("package manager");
    expect(text.toLowerCase()).toContain("package manager");
    expect(text.toLowerCase()).toContain("pnpm");
  });

  it("does not treat live-in queries as London", () => {
    const text = queryEmbeddingText("where does the user live").toLowerCase();
    expect(text).toContain("live");
    expect(text).not.toContain("london");
  });
});

describe("contentTokens", () => {
  it("stems ascii and keeps unicode stems as the raw token", () => {
    expect(contentTokens("packages", true)).toEqual(["packag"]);
    expect(contentTokens("الشاي", true)).toEqual(["الشاي"]);
  });

  it("drops about so project queries keep the entity", () => {
    expect(
      contentTokens("what do we know about the Polaris project", true),
    ).toEqual(["polari", "project"]);
  });

  it("stems lives to live so residence queries match Lives in", () => {
    expect(contentTokens("Lives in Lisbon", true)).toEqual(["live", "lisbon"]);
  });
});
