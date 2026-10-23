import { describe, expect, it } from "vitest";
import {
  buildDreamSkillPrompt,
  type DreamSkillMemory,
} from "../../engine/memory/dream/skillDraft";
import { buildEntityExtractionPrompt } from "../../engine/memory/entities";
import { buildFactExtractionPrompt } from "../../engine/memory/extractFacts";
import { buildFactDecisionPrompt } from "../../engine/memory/factDecision";

// Provider prompt caches match on a byte-identical prefix, so the stable
// instructions must come before any per-call data.

function sharedPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

describe("prompts put stable instructions before per-call data", () => {
  it("fact extraction: dates and the message come after the schema", () => {
    const prefix = sharedPrefix(
      buildFactExtractionPrompt(
        "I use Bun",
        "2026-10-01T00:00:00.000Z",
        "2026-10-01T00:00:00.000Z",
      ),
      buildFactExtractionPrompt(
        "I moved to Leeds",
        "2026-10-23T12:34:56.789Z",
        "2026-10-23T12:34:56.789Z",
      ),
    );
    expect(prefix).toContain("# Output schema");
    expect(prefix).toContain('If no durable facts: { "facts": [] }');
  });

  it("fact decision: the fact and candidates come after the rules", () => {
    const prefix = sharedPrefix(
      buildFactDecisionPrompt("I prefer Rust", []),
      buildFactDecisionPrompt("I work at Acme", [
        { id: "m1", title: "Job", content: "I work at Initech" },
      ]),
    );
    expect(prefix).toContain("# Events");
    expect(prefix).toContain('NONE: { "event": "NONE" }');
  });

  it("entity extraction: the memory and lists come after the output format", () => {
    const prefix = sharedPrefix(
      buildEntityExtractionPrompt("Helios", "Helios ships", [], []),
      buildEntityExtractionPrompt(
        "Orion",
        "Orion ships",
        [{ id: "m1", title: "Orion kickoff" }],
        [{ name: "Orion", normalizedName: "orion", type: "project" }],
      ),
    );
    expect(prefix).toContain("# Rules");
    expect(prefix).toContain('{"entities":[{"name":"Helios"');
  });

  it("dream skill: the reply format comes before the user's skill names", () => {
    const memory: DreamSkillMemory = {
      id: "row",
      title: "Deploy",
      content: "It worked.",
      createdAt: 0,
      outcome: "worked",
    };
    const prefix = sharedPrefix(
      buildDreamSkillPrompt([memory], []),
      buildDreamSkillPrompt([memory], ["review-pr"]),
    );
    expect(prefix).toContain('Reply as JSON: {"skills"');
  });
});
