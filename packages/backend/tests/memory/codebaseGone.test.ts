import { describe, expect, it } from "vitest";
import {
  RETIRED_SYSTEM_SKILL_NAMES,
  SYSTEM_SKILL_SEEDS,
} from "../../convex/prompts/systemSkillSeeds";

describe("codebase graph feature is gone", () => {
  it("system skill seeds no longer ship codebase wiki playbooks", () => {
    expect(SYSTEM_SKILL_SEEDS.map((seed) => seed.name)).toEqual([
      "wiki-writeup",
      "teach-me",
      "search-skills-first",
    ]);
    expect(
      SYSTEM_SKILL_SEEDS.some((seed) => seed.category === "Codebases"),
    ).toBe(false);
    expect([...RETIRED_SYSTEM_SKILL_NAMES]).toEqual([
      "setup-wiki",
      "update-wiki",
      "Codebase Knowledge Base",
    ]);
  });
});
