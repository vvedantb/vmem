import { describe, expect, it } from "vitest";
import {
  normalizeEntityName,
  parseFullEnrichmentResponse,
  sanitizeTag,
} from "../convex/prompts/enrichmentPrompt";

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

describe("normalizeEntityName", () => {
  it("trims, lowercases, and collapses internal whitespace", () => {
    expect(normalizeEntityName("  Claude   3.5  Sonnet  ")).toBe(
      "claude 3.5 sonnet",
    );
  });

  it("caps entity names at 100 characters", () => {
    expect(normalizeEntityName("x".repeat(120)).length).toBe(100);
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
