import { describe, expect, it } from "vitest";
import {
  applyTagMerges,
  planTagAiGroups,
  planTagMerges,
  tagMergeFromVerdict,
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
    // a short brand is too risky for a plain suffix tag
    expect(planTagMerges(["telecom", "tele"])).toEqual([]);
    expect(planTagMerges(["youtubecom", "youtube"])).toEqual([
      { keeper: "youtube", losers: ["youtubecom"] },
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

describe("AI tier planning", () => {
  const count = (tag: string, n: number) => ({ tag, count: n });

  it("groups look-alike leftovers, busiest first, and skips unrelated tags", () => {
    const groups = planTagAiGroups(
      [
        count("machinelearning", 2),
        count("machine-learning", 9),
        count("tools", 1),
        count("tool", 3),
        count("rust", 5),
      ],
      new Set(),
    );
    expect(groups.map((g) => g.map((t) => t.tag))).toEqual([
      ["machine-learning", "machinelearning"],
      ["tool", "tools"],
    ]);
  });

  it("leaves out tags the deterministic tier took and caps the group count", () => {
    expect(
      planTagAiGroups(
        [count("youtube", 4), count("youtubes", 1)],
        new Set(["youtube"]),
      ),
    ).toEqual([]);
    const many = ["alpha", "beta1", "gamma", "delta", "omega", "sigma"].flatMap(
      (base) => [count(`${base}-x`, 2), count(`${base}x`, 1)],
    );
    expect(planTagAiGroups(many, new Set(), 2)).toHaveLength(2);
  });

  it("merges only a flagged verdict and picks the keeper itself", () => {
    const group = [count("machinelearning", 2), count("machine-learning", 9)];
    expect(
      tagMergeFromVerdict(group, {
        status: "flagged",
        keeperId: "machinelearning",
        removeIds: ["machine-learning"],
        reason: "Same fact stated in different words",
        confidence: 0.9,
      }),
    ).toEqual({ keeper: "machine-learning", losers: ["machinelearning"] });
    expect(
      tagMergeFromVerdict(group, {
        status: "not_duplicate",
        reason: "Different",
        confidence: 0.2,
      }),
    ).toBeNull();
    // Jev names a tag outside the group: nothing is invented
    expect(
      tagMergeFromVerdict(group, {
        status: "flagged",
        keeperId: "ml",
        removeIds: ["machine-learning"],
        reason: "x",
        confidence: 0.9,
      }),
    ).toBeNull();
  });
});

describe("normalizeTags write-time merges", () => {
  it("collapses dotted hosts and strong legacy forms to the brand", () => {
    expect(normalizeTags(["www.youtube.com"])).toEqual(["youtube"]);
    expect(normalizeTags(["wwwyoutubecom"])).toEqual(["youtube"]);
    expect(normalizeTags(["wwwyoutubecom", "youtube.com", "youtube"])).toEqual([
      "youtube",
    ]);
    expect(normalizeTags(["www.bbc.co.uk"])).toEqual(["bbc"]);
  });

  it("merges a weak legacy tag only next to its brand", () => {
    expect(normalizeTags(["youtubecom", "youtube"])).toEqual(["youtube"]);
    expect(normalizeTags(["youtubecom"])).toEqual(["youtubecom"]);
    expect(normalizeTags(["telecom"])).toEqual(["telecom"]);
  });

  it("uses existing tags to merge a lone weak legacy tag", () => {
    expect(normalizeTags(["youtubecom"], 10, ["youtube"])).toEqual(["youtube"]);
    expect(normalizeTags(["telecom"], 10, ["tele"])).toEqual(["telecom"]);
  });

  it("caps after merging", () => {
    expect(normalizeTags(["a1", "wwwyoutubecom", "youtube", "b2"], 2)).toEqual([
      "a1",
      "youtube",
    ]);
  });
});
