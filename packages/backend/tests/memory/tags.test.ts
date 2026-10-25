import { describe, expect, it } from "vitest";
import {
  applyTagMerges,
  planTagMerges,
} from "../../engine/memory/dream/tagConsolidate";
import {
  legacyDomainTag,
  normalizeTags,
  sanitizeTag,
} from "../../engine/memory/tags";

describe("sanitizeTag host names", () => {
  it("collapses host spellings to the brand", () => {
    for (const raw of [
      "www.youtube.com",
      "youtube.com",
      "YouTube",
      "https://www.youtube.com/watch?v=1",
      "m.youtube.com",
    ]) {
      expect(sanitizeTag(raw)).toBe("youtube");
    }
  });

  it("handles compound suffixes and keeps the label when none is left", () => {
    expect(sanitizeTag("www.bbc.co.uk")).toBe("bbc");
    expect(sanitizeTag("github.com")).toBe("github");
    expect(sanitizeTag("docs.google.com")).toBe("google");
    expect(sanitizeTag("com")).toBe("com");
    expect(sanitizeTag("co.uk")).toBe("couk");
  });

  it("leaves ordinary tags alone", () => {
    expect(sanitizeTag("node.js")).toBe("nodejs");
    expect(sanitizeTag("v1.2")).toBe("v12");
    expect(sanitizeTag("My  Project_X")).toBe("my-project-x");
    expect(sanitizeTag("telecom")).toBe("telecom");
  });

  it("normalizeTags keeps one tag for several spellings", () => {
    expect(
      normalizeTags(["www.youtube.com", "youtube.com", "YouTube"]),
    ).toEqual(["youtube"]);
  });
});

describe("legacy dotless host tags", () => {
  it("reads the brand of wwwyoutubecom and youtubecom", () => {
    expect(legacyDomainTag("wwwyoutubecom")).toEqual({
      brand: "youtube",
      strong: true,
    });
    expect(legacyDomainTag("youtubecom")).toEqual({
      brand: "youtube",
      strong: false,
    });
    expect(legacyDomainTag("wwwbbccouk")).toEqual({
      brand: "bbc",
      strong: true,
    });
    expect(legacyDomainTag("youtube")).toBeNull();
  });

  it("merges every spelling into youtube", () => {
    expect(
      planTagMerges(["wwwyoutubecom", "youtubecom", "youtube", "rust"]),
    ).toEqual([{ keeper: "youtube", losers: ["wwwyoutubecom", "youtubecom"] }]);
  });

  it("renames a lone www tag but not a lone plain suffix tag", () => {
    expect(planTagMerges(["wwwgithubcom"])).toEqual([
      { keeper: "github", losers: ["wwwgithubcom"] },
    ]);
    expect(planTagMerges(["telecom"])).toEqual([]);
    expect(planTagMerges(["telecom", "tele"])).toEqual([
      { keeper: "tele", losers: ["telecom"] },
    ]);
  });

  it("is idempotent", () => {
    const merges = planTagMerges(["wwwyoutubecom", "youtubecom", "youtube"]);
    const after = new Set(
      ["wwwyoutubecom", "youtubecom", "youtube"].map(
        (tag) => applyTagMerges([tag], merges)[0] ?? tag,
      ),
    );
    expect(planTagMerges(after)).toEqual([]);
  });

  it("applyTagMerges keeps order and drops repeats", () => {
    const merges = [{ keeper: "youtube", losers: ["wwwyoutubecom"] }];
    expect(
      applyTagMerges(["a", "wwwyoutubecom", "youtube", "b"], merges),
    ).toEqual(["a", "youtube", "b"]);
  });
});
