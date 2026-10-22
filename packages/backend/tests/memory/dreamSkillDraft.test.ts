import { describe, expect, it } from "vitest";
import {
  buildDreamSkillPrompt,
  DREAM_SKILL_MAX_DRAFTS,
  DREAM_SKILL_MAX_MEMORIES,
  existingSkillForDedupe,
  parseDreamSkillReply,
  pickSkillSources,
  skillInstructions,
  type DreamSkillMemory,
} from "../../engine/memory/dream/skillDraft";

const CREATED = Date.parse("2026-10-21T09:00:00Z");

const WORKED: DreamSkillMemory = {
  id: "row_worked",
  title: "Convex deploy to staging",
  content:
    "Ran pnpm install, then pnpm typecheck, then npx convex deploy --preview. It worked.",
  createdAt: CREATED + 2000,
  outcome: "worked",
};
const FAILED: DreamSkillMemory = {
  id: "row_failed",
  title: "Convex deploy attempt",
  content: "Deploy failed: the generated types were stale.",
  createdAt: CREATED + 1000,
  outcome: "failed",
};
const MEMORIES = [FAILED, WORKED];

const DEPLOY_SKILL = {
  name: "deploy-convex-preview",
  description: "Use when a task asks to deploy the Convex backend to a preview",
  steps: [
    "Install dependencies with pnpm install.",
    "Run pnpm typecheck and fix every error.",
    "Deploy with npx convex deploy --preview.",
  ],
  pitfalls: ["Do not deploy with stale generated types; regenerate first."],
  sourceIds: ["m0", "m1"],
};

function reply(skills: object[]): string {
  return JSON.stringify({ skills });
}

describe("pickSkillSources", () => {
  it("makes no call input when nothing worked", () => {
    expect(pickSkillSources([FAILED])).toEqual([]);
    expect(pickSkillSources([])).toEqual([]);
  });

  it("puts what worked first, newest first, and caps the list", () => {
    const mixed = { ...WORKED, id: "row_mixed", outcome: "mixed" as const };
    expect(pickSkillSources([FAILED, WORKED, mixed]).map((m) => m.id)).toEqual([
      "row_worked",
      "row_mixed",
      "row_failed",
    ]);
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...WORKED,
      id: `row_${String(i)}`,
      createdAt: CREATED + i,
    }));
    expect(pickSkillSources(many)).toHaveLength(DREAM_SKILL_MAX_MEMORIES);
  });
});

describe("buildDreamSkillPrompt", () => {
  const prompt = buildDreamSkillPrompt(pickSkillSources(MEMORIES), [
    "review-pr",
  ]);

  it("labels each memory with its outcome and never sends row ids", () => {
    expect(prompt).toContain('"outcome": "worked"');
    expect(prompt).toContain('"outcome": "failed"');
    expect(prompt).toContain('"id": "m0"');
    expect(prompt).not.toContain("row_worked");
  });

  it("prefers what worked and turns failures into labelled pitfalls", () => {
    expect(prompt).toContain("Prefer the steps that worked");
    expect(prompt).toContain("pitfalls");
    expect(prompt).toContain('Never from "failed" memories alone');
    expect(prompt).toContain("Use when a task names");
    expect(prompt).toContain("Use when a task asks to");
    expect(prompt).toContain("Existing skills: review-pr");
  });
});

describe("parseDreamSkillReply", () => {
  const sources = pickSkillSources(MEMORIES);

  it("keeps a valid draft with a direct trigger, steps and pitfalls", () => {
    const parsed = parseDreamSkillReply(sources, reply([DEPLOY_SKILL]), []);
    expect(parsed?.dropped).toEqual({ invalid: 0, unsafe: 0, duplicate: 0 });
    expect(parsed?.drafts).toEqual([
      {
        name: "deploy-convex-preview",
        description:
          "Use when a task asks to deploy the Convex backend to a preview",
        steps: DEPLOY_SKILL.steps,
        pitfalls: DEPLOY_SKILL.pitfalls,
        sourceIds: ["row_worked", "row_failed"],
      },
    ]);
  });

  it("repairs a near-miss trigger and drops a vague one", () => {
    const repaired = parseDreamSkillReply(
      sources,
      reply([
        {
          ...DEPLOY_SKILL,
          description: "Use when you need to deploy Convex to a preview",
        },
      ]),
      [],
    );
    expect(repaired?.drafts[0]?.description).toBe(
      "Use when a task asks to deploy Convex to a preview",
    );
    const vague = parseDreamSkillReply(
      sources,
      reply([{ ...DEPLOY_SKILL, description: "Use when working on this" }]),
      [],
    );
    expect(vague?.drafts).toEqual([]);
    expect(vague?.dropped.invalid).toBe(1);
  });

  it("drops a draft backed only by failures, or with too few general steps", () => {
    const failedOnly = parseDreamSkillReply(
      sources,
      reply([{ ...DEPLOY_SKILL, sourceIds: ["m1"] }]),
      [],
    );
    expect(failedOnly?.drafts).toEqual([]);
    const runSpecific = parseDreamSkillReply(
      sources,
      reply([
        {
          ...DEPLOY_SKILL,
          steps: [
            "Install dependencies.",
            "Open /tmp/build-123/out.log.",
            "It deployed fine.",
          ],
        },
      ]),
      [],
    );
    expect(runSpecific?.drafts).toEqual([]);
    expect(runSpecific?.dropped.invalid).toBe(1);
  });

  it("drops a skill that bypasses a safeguard, keeps a warning", () => {
    const unsafe = parseDreamSkillReply(
      sources,
      reply([
        {
          ...DEPLOY_SKILL,
          steps: [
            ...DEPLOY_SKILL.steps,
            "Commit with git commit --no-verify to skip the hooks.",
          ],
        },
      ]),
      [],
    );
    expect(unsafe?.drafts).toEqual([]);
    expect(unsafe?.dropped.unsafe).toBe(1);
    const warning = parseDreamSkillReply(
      sources,
      reply([
        {
          ...DEPLOY_SKILL,
          pitfalls: ["Never use --no-verify to get past a failing hook."],
        },
      ]),
      [],
    );
    expect(warning?.drafts).toHaveLength(1);
  });

  it("drops near-duplicates of existing skills and of earlier drafts", () => {
    const existing = existingSkillForDedupe({
      name: "deploy-convex-preview-2",
      description: "Use when a task asks to deploy Convex to a preview.",
      instructions: "1. Run pnpm typecheck.\n2. Deploy with npx convex deploy.",
    });
    const againstExisting = parseDreamSkillReply(
      sources,
      reply([DEPLOY_SKILL]),
      [existing],
    );
    expect(againstExisting?.drafts).toEqual([]);
    expect(againstExisting?.dropped.duplicate).toBe(1);
    const twice = parseDreamSkillReply(
      sources,
      reply([DEPLOY_SKILL, { ...DEPLOY_SKILL, name: "deploy-convex-preview" }]),
      [],
    );
    expect(twice?.drafts).toHaveLength(1);
    expect(twice?.dropped.duplicate).toBe(1);
  });

  it("keeps an unrelated existing skill out of the way", () => {
    const other = existingSkillForDedupe({
      name: "review-pr",
      description: "Use when a task asks to review a pull request.",
      instructions: "1. Read the diff.\n2. Run the tests.\n3. Leave comments.",
    });
    expect(
      parseDreamSkillReply(sources, reply([DEPLOY_SKILL]), [other])?.drafts,
    ).toHaveLength(1);
  });

  it(`caps the drafts at ${String(DREAM_SKILL_MAX_DRAFTS)}`, () => {
    const names = ["write-changelog", "rotate-api-keys", "seed-local-db"];
    const skills = names.map((name) => ({
      ...DEPLOY_SKILL,
      name,
      description: `Use when a task asks to ${name.replace(/-/g, " ")}`,
      steps: [
        `Open the ${name} runbook.`,
        `Follow the ${name} checklist.`,
        `Record the ${name} result.`,
      ],
    }));
    expect(
      parseDreamSkillReply(sources, reply(skills), [])?.drafts.map(
        (draft) => draft.name,
      ),
    ).toEqual(names.slice(0, DREAM_SKILL_MAX_DRAFTS));
  });

  it("returns null for a malformed reply", () => {
    expect(parseDreamSkillReply(sources, null, [])).toBeNull();
    expect(parseDreamSkillReply(sources, "not json", [])).toBeNull();
  });
});

describe("skillInstructions", () => {
  it("numbers the steps and labels the pitfalls", () => {
    expect(
      skillInstructions({
        steps: ["Run the tests.", "Deploy."],
        pitfalls: ["Do not deploy on Friday."],
      }),
    ).toBe(
      "1. Run the tests.\n2. Deploy.\n\nPitfalls (from approaches that failed):\n- Do not deploy on Friday.",
    );
    expect(skillInstructions({ steps: ["Run the tests."], pitfalls: [] })).toBe(
      "1. Run the tests.",
    );
  });
});
