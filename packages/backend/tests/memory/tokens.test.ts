import { describe, expect, it } from "vitest";
import { contentTokens, tokenize } from "../../engine/memory/tokens";

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
});

describe("contentTokens", () => {
  it("stems ascii and keeps unicode stems as the raw token", () => {
    expect(contentTokens("packages", true)).toEqual(["packag"]);
    expect(contentTokens("الشاي", true)).toEqual(["الشاي"]);
  });
});
