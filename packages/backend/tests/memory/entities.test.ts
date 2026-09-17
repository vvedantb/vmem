import { describe, expect, it } from "vitest";
import {
  autoLinksFromMemories,
  extractEntitiesFallback,
  parseEntityExtractionResponse,
  projectOverviewName,
  suggestRelatedMemoryIds,
} from "../../engine/memory/entities";
import { generateBenchmarkCorpus } from "../../eval/corpus";

describe("extractEntitiesFallback", () => {
  it("pulls proper names, team phrases, and project titles", () => {
    const entities = extractEntitiesFallback({
      title: "Helios is built and run by the platform team",
      content: "Helios is built and operated end to end by the platform team.",
      tags: ["ownership", "helios"],
    });
    const names = entities.map((entity) => entity.normalizedName);
    expect(names).toContain("helios");
    expect(names).toContain("platform");
  });

  it("extracts Alice from two fact texts", () => {
    const a = extractEntitiesFallback({
      title: "Alice prefers dark mode",
      content: "Alice uses dark mode in every editor.",
    });
    const b = extractEntitiesFallback({
      title: "Alice lives in London",
      content: "Alice is based in London.",
    });
    expect(a.some((entity) => entity.normalizedName === "alice")).toBe(true);
    expect(b.some((entity) => entity.normalizedName === "alice")).toBe(true);
  });

  it("does not treat generic 'data' as an entity unless it is a team", () => {
    const entities = extractEntitiesFallback({
      title: "The mobile team stores data in a managed column store",
      content:
        "For this initiative the mobile team chose a managed column store for fast aggregate reads.",
      tags: ["project-detail"],
    });
    const names = entities.map((entity) => entity.normalizedName);
    expect(names).toContain("mobile");
    expect(names).not.toContain("data");
  });
});

describe("parseEntityExtractionResponse", () => {
  it("reads entities and related ids from LLM JSON", () => {
    const parsed = parseEntityExtractionResponse(
      '{"entities":[{"name":"Helios","type":"project"},{"name":"Dana","type":"person"}],"relatedMemoryIds":["mem_a"]}',
    );
    expect(parsed?.entities.map((entity) => entity.name)).toEqual([
      "Helios",
      "Dana",
    ]);
    expect(parsed?.relatedMemoryIds).toEqual(["mem_a"]);
  });

  it("returns empty entities when the field is missing", () => {
    const parsed = parseEntityExtractionResponse('{"relatedMemoryIds":[]}');
    expect(parsed?.entities).toEqual([]);
  });
});

describe("suggestRelatedMemoryIds", () => {
  it("attaches project-detail facts to the latest project overview", () => {
    const related = suggestRelatedMemoryIds({
      title: "The mobile team stores data in a managed column store",
      content:
        "For this initiative the mobile team chose a managed column store for fast aggregate reads.",
      tags: ["project-detail"],
      candidates: [
        { id: "older", title: "Vega project overview" },
        { id: "anchor", title: "Polaris project overview" },
      ],
    });
    expect(related[0]?.id).toBe("anchor");
    expect(related[0]?.reason).toContain("Polaris");
  });

  it("reads a project name from overview titles", () => {
    expect(projectOverviewName("Polaris project overview")).toBe("Polaris");
    expect(projectOverviewName("Coffee order")).toBeNull();
  });
});

describe("autoLinksFromMemories", () => {
  it("links two Alice facts via the shared entity", () => {
    const links = autoLinksFromMemories([
      {
        id: "a",
        title: "Alice prefers dark mode",
        content: "Alice uses dark mode in every editor.",
      },
      {
        id: "b",
        title: "Alice lives in London",
        content: "Alice is based in London.",
      },
    ]);
    expect(links).toHaveLength(1);
    expect(links[0]?.reason.toLowerCase()).toContain("alice");
  });

  it("links multi-hop facts that share a team board, not only 'the X team'", () => {
    const links = autoLinksFromMemories([
      {
        id: "bridge",
        title: "Helios rollout was reviewed by the platform board",
        content:
          "The Helios rollout went through a sign-off at the platform board.",
      },
      {
        id: "gold",
        title: "Dana chairs the platform board and approves rollouts",
        content:
          "Dana chairs the platform board, the body that approves rollouts.",
      },
    ]);
    expect(
      links.some((link) => link.reason.toLowerCase().includes("platform")),
    ).toBe(true);
  });

  it("recovers labelled multi-hop and project edges without planted relationships", () => {
    const corpus = generateBenchmarkCorpus();
    const autoLinks = autoLinksFromMemories(corpus.memories);
    const planted = new Set(
      corpus.relationships.map((rel) => {
        const [left, right] =
          rel.sourceId < rel.targetId
            ? [rel.sourceId, rel.targetId]
            : [rel.targetId, rel.sourceId];
        return `${left}|${right}`;
      }),
    );
    const recovered = autoLinks.filter((link) => {
      const key = `${link.sourceId}|${link.targetId}`;
      return planted.has(key);
    });
    expect(recovered.length).toBeGreaterThanOrEqual(30);
    expect(autoLinks.length).toBeGreaterThan(recovered.length);
  });
});
