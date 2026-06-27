import { describe, expect, it } from "vitest";
import {
  isSkillReferencedInMessage,
  matchSkillsForMessage,
  type SkillPromptEntry,
} from "@vmem/shared";

const SKILLS: SkillPromptEntry[] = [
  {
    name: "writeup",
    description: "wiki writeup",
    instructions: "# writeup playbook",
    enabled: true,
  },
  {
    name: "teach-me",
    description: "interactive tutor",
    instructions: "# teach-me playbook",
    enabled: true,
  },
  {
    name: "disabled-skill",
    description: "off",
    instructions: "nope",
    enabled: false,
  },
];

describe("isSkillReferencedInMessage", () => {
  it("matches slash commands", () => {
    expect(isSkillReferencedInMessage("writeup", "/writeup on LLMs")).toBe(
      true,
    );
    expect(isSkillReferencedInMessage("teach-me", "/teach-me rust")).toBe(true);
  });

  it("matches plain name mentions", () => {
    expect(isSkillReferencedInMessage("writeup", "use writeup for this")).toBe(
      true,
    );
  });
});

describe("matchSkillsForMessage", () => {
  it("returns full instructions for matched enabled skills", () => {
    const result = matchSkillsForMessage(SKILLS, "/writeup on transformers");
    expect(result.matchedNames).toEqual(["writeup"]);
    expect(result.instructionsMarkdown).toContain("# writeup playbook");
  });

  it("skips disabled skills", () => {
    const result = matchSkillsForMessage(SKILLS, "disabled-skill please");
    expect(result.matchedNames).toHaveLength(0);
    expect(result.instructionsMarkdown).toBe("");
  });
});
