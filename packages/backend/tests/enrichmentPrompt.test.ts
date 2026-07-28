// AI-generated (Claude), prompt: "test enrichment prompt building and tag normalize helpers"
// Modified by me: merged case variants and capped tag list length
import { describe, expect, it } from "vitest";
import {
  buildFullEnrichmentPrompt,
  normalizeEntityName,
  parseFullEnrichmentResponse,
} from "../convex/prompts/enrichmentPrompt";
import {
  normalizeTags,
  sanitizeTag,
} from "../engine/neo4j/memory/tagNormalize";

describe("normalizeTags", () => {
  it("merges case/format variants into one canonical tag", () => {
    expect(normalizeTags(["GCP", "gcp", "Gcp "])).toEqual(["gcp"]);
    expect(normalizeTags(["Machine Learning", "machine-learning"])).toEqual([
      "machine-learning",
    ]);
  });

  it("drops tags that sanitize to empty and preserves order", () => {
    expect(normalizeTags(["!!!", "react", "", "vue"])).toEqual([
      "react",
      "vue",
    ]);
  });

  it("caps the number of tags", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag-${String(i)}`);
    expect(normalizeTags(many).length).toBe(10);
    expect(normalizeTags(many, 3).length).toBe(3);
  });
});

describe("buildFullEnrichmentPrompt tag vocabulary", () => {
  it("includes the existing tag vocabulary with usage counts", () => {
    const prompt = buildFullEnrichmentPrompt(
      "t",
      "c",
      [],
      [
        { name: "react", uses: 76 },
        { name: "llm", uses: 15 },
      ],
    );
    expect(prompt).toContain("react (76), llm (15)");
  });

  it("notes an empty vocabulary instead of omitting the section", () => {
    const prompt = buildFullEnrichmentPrompt("t", "c", []);
    expect(prompt).toContain("(none yet");
  });
});

describe("sanitizeTag", () => {
  it("lowercases and hyphenates tags", () => {
    expect(sanitizeTag("React 19")).toBe("react-19");
    expect(sanitizeTag("TypeScript")).toBe("typescript");
    expect(sanitizeTag("neo4j_graph")).toBe("neo4j-graph");
  });

  it("strips characters that are not alphanumeric or hyphen", () => {
    expect(sanitizeTag("C++")).toBe("c");
    expect(sanitizeTag("!!!")).toBe("");
  });

  it("caps tag length at 50 characters", () => {
    const long = "a".repeat(60);
    expect(sanitizeTag(long).length).toBe(50);
  });
});

describe("parseFullEnrichmentResponse entity dedup", () => {
  it("collapses the same name under two types into one entity (first type wins)", () => {
    const result = parseFullEnrichmentResponse(
      JSON.stringify({
        tags: ["ai"],
        relatedMemoryIds: [],
        entities: [
          { name: "agenteva1[bot]", type: "person" },
          { name: "Agenteva1[bot]", type: "technology" },
        ],
      }),
    );
    expect(result?.entities).toEqual([
      {
        name: "agenteva1[bot]",
        normalizedName: "agenteva1[bot]",
        type: "person",
      },
    ]);
  });
});

describe("parseFullEnrichmentResponse tag cap", () => {
  it("caps parsed tags at 4", () => {
    const result = parseFullEnrichmentResponse(
      JSON.stringify({
        tags: ["a1", "b2", "c3", "d4", "e5", "f6"],
        relatedMemoryIds: [],
        entities: [],
      }),
    );
    expect(result?.tags).toEqual(["a1", "b2", "c3", "d4"]);
  });
});

describe("normalizeEntityName", () => {
  it("trims, lowercases, and collapses internal whitespace", () => {
    expect(normalizeEntityName("  Claude   3.5  Sonnet  ")).toBe(
      "claude 3.5 sonnet",
    );
  });

  it("caps entity names at 100 characters", () => {
    expect(normalizeEntityName("x".repeat(120)).length).toBe(100);
  });

  it("treats hyphens as spaces so hyphen variants share identity", () => {
    expect(normalizeEntityName("Claude Fable-5")).toBe("claude fable 5");
    expect(normalizeEntityName("Claude Fable 5")).toBe("claude fable 5");
  });
});

describe("parseFullEnrichmentResponse", () => {
  it("parses tags, related memories, and entities from JSON", () => {
    const result = parseFullEnrichmentResponse(
      JSON.stringify({
        tags: ["React", "Next.js"],
        relatedMemoryIds: ["mem-1", ""],
        entities: [
          { name: "Vercel", type: "organization" },
          { name: "Next.js", type: "technology" },
        ],
      }),
    );

    expect(result).toEqual({
      tags: ["react", "nextjs"],
      relatedMemoryIds: ["mem-1"],
      entities: [
        {
          name: "Vercel",
          normalizedName: "vercel",
          type: "organization",
        },
        {
          name: "Next.js",
          normalizedName: "next.js",
          type: "technology",
        },
      ],
    });
  });

  it("parses JSON inside a markdown fence", () => {
    const result = parseFullEnrichmentResponse(
      '```json\n{"tags":["graphql"],"relatedMemoryIds":[],"entities":[]}\n```',
    );
    expect(result).toEqual({
      tags: ["graphql"],
      relatedMemoryIds: [],
      entities: [],
    });
  });

  it("rejects responses with no usable tags after sanitization", () => {
    expect(
      parseFullEnrichmentResponse('{"tags":["!!!"],"relatedMemoryIds":[]}'),
    ).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseFullEnrichmentResponse("{tags:")).toBeNull();
  });

  it("deduplicates entities by normalized name and type", () => {
    const result = parseFullEnrichmentResponse(
      JSON.stringify({
        tags: ["ai"],
        relatedMemoryIds: [],
        entities: [
          { name: "OpenAI", type: "organization" },
          { name: "  openai ", type: "organization" },
        ],
      }),
    );

    expect(result?.entities).toHaveLength(1);
  });

  it("ignores entities with invalid types", () => {
    const result = parseFullEnrichmentResponse(
      JSON.stringify({
        tags: ["misc"],
        relatedMemoryIds: [],
        entities: [{ name: "Bob", type: "celebrity" }],
      }),
    );

    expect(result?.entities).toEqual([]);
  });
});
