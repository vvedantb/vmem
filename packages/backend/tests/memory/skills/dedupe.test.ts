import { describe, expect, it } from "vitest";
import {
  dedupeSkills,
  isNearDuplicateSkill,
  isNearDuplicateStep,
} from "../../../engine/memory/skills/dedupe";

// Synthetic: one git identity skill per group, as a real run wrote them.
const gitSkills = [
  {
    name: "configure-git-identity",
    description: "Use when a task asks to commit but Git has no user set.",
    steps: [
      "Copy the author name and email from a past commit.",
      "Set git user.name and user.email to those values.",
      "Proceed with the commit.",
    ],
  },
  {
    name: "configure-git-identity",
    description: "Use when a task names the widget parser.",
    steps: [
      "Check the local git user.name and user.email.",
      "Set git config user.name if it is missing.",
      "Verify the configuration is saved locally.",
    ],
  },
  {
    name: "configure-git-identity-locally",
    description: "Use when a task names the demo app.",
    steps: [
      "Set git config user.name with the local scope flag.",
      "Verify the configuration in .git/config.",
      "Proceed with the commit.",
    ],
  },
  {
    name: "configure-git-user-locally",
    description: "Use when a task names the sample library.",
    steps: [
      "Check if global git user.name and user.email are set.",
      "Set repository-local git user.name and user.email values.",
      "Proceed with the commit using the local identity.",
    ],
  },
  {
    name: "configure-local-git-context",
    description: "Use when a task names the toy service.",
    steps: [
      "Run git config scoped to the local repository for user.name and user.email.",
      "Verify the local configuration with git config --local.",
      "Proceed with the commit using the local identity.",
    ],
  },
];

const unrelated = {
  name: "configure-dead-letter-routing",
  description: "Use when a task names dead letter queues.",
  steps: ["Read the queue config.", "Route rejects to the DLX.", "Test it."],
};

describe("isNearDuplicateSkill", () => {
  it("matches names that differ by a numeric suffix", () => {
    expect(
      isNearDuplicateSkill(
        { ...unrelated, name: "parse-ansi-sgr" },
        { ...unrelated, name: "parse-ansi-sgr-2", steps: ["Other."] },
      ),
    ).toBe(true);
  });

  it("does not match a shared verb alone", () => {
    expect(isNearDuplicateSkill(gitSkills[0] ?? unrelated, unrelated)).toBe(
      false,
    );
  });
});

describe("isNearDuplicateStep", () => {
  it("matches a step contained in a longer one", () => {
    expect(
      isNearDuplicateStep(
        "Proceed with the commit operation.",
        "Proceed with the commit operation using the local identity.",
      ),
    ).toBe(true);
    expect(isNearDuplicateStep("Run the tests.", "Read omit.txt first.")).toBe(
      false,
    );
  });
});

describe("dedupeSkills", () => {
  it("collapses the git identity family across groups to one skill", () => {
    const lists = [...gitSkills.map((skill) => [skill]), [unrelated]];
    const result = dedupeSkills(lists);
    expect(result.before).toBe(6);
    expect(result.after).toBe(2);
    const merged = result.lists[0]?.[0];
    expect(merged?.name).toBe("configure-git-identity");
    expect(merged?.description).toBe(
      "Use when a task asks to commit but Git has no user set.",
    );
    // One object, linked from every group that held a member.
    for (const list of result.lists.slice(0, gitSkills.length)) {
      expect(list).toEqual([merged]);
      expect(list[0]).toBe(merged);
    }
    expect(result.lists.at(-1)).toEqual([unrelated]);
    const steps = merged?.steps ?? [];
    expect(steps.length).toBeLessThanOrEqual(10);
    expect(steps.slice(0, 3)).toEqual(gitSkills[0]?.steps);
    expect(
      steps.filter((step) => step.startsWith("Proceed with the commit")),
    ).toHaveLength(1);
  });

  it("caps merged steps at 10 and strips numeric suffixes", () => {
    const words =
      "alpha beta gamma delta omega kappa sigma theta iota zeta lambda rho";
    const steps = (from: number) =>
      words
        .split(" ")
        .slice(from, from + 6)
        .map((word) => `Tune ${word}.`);
    const result = dedupeSkills([
      [
        {
          name: "tune-cache-2",
          description: "Use when caching.",
          steps: steps(0),
        },
      ],
      [
        {
          name: "tune-cache-3",
          description: "Use when caching x.",
          steps: steps(6),
        },
      ],
    ]);
    expect(result.after).toBe(1);
    expect(result.lists[0]?.[0]?.name).toBe("tune-cache");
    expect(result.lists[0]?.[0]?.steps).toHaveLength(10);
  });

  it("holds a merged skill once per group", () => {
    const result = dedupeSkills([[unrelated, { ...unrelated }]]);
    expect(result).toMatchObject({ before: 2, after: 1 });
    expect(result.lists[0]).toHaveLength(1);
  });

  it("prefers a description that starts with Use when", () => {
    const result = dedupeSkills([
      [
        {
          ...unrelated,
          description: "A long description of dead letter routing in detail.",
        },
      ],
      [unrelated],
    ]);
    expect(result.lists[0]?.[0]?.description).toBe(unrelated.description);
  });
});
