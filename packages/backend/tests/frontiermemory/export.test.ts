import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildMemoryFiles,
  toUseWhen,
  writeMemoryFolder,
} from "../../eval/frontiermemory/export";
import type { MergedGroup } from "../../eval/frontiermemory/types";

function group(overrides: Partial<MergedGroup>): MergedGroup {
  return {
    groupId: "build-word2vec-pipeline",
    taskId: "build-word2vec-pipeline",
    label: "Word2Vec pipeline",
    runs: 3,
    pass: 2,
    fail: 1,
    instructions: [
      { text: "Read the omit file first.", kind: "procedure", support: 2 },
      { text: "Do not train on omitted files.", kind: "pitfall", support: 1 },
    ],
    superseded: [],
    skills: [
      {
        name: "omit-aware-corpus",
        description: "Builds a corpus.",
        steps: ["Read omit.txt", "Filter paths", "Train"],
      },
    ],
    source: "deterministic",
    ...overrides,
  };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "fm-export-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("toUseWhen", () => {
  it.each([
    ["Builds a corpus.", "Use when builds a corpus."],
    [
      "use when: the task names an omit file",
      "Use when the task names an omit file",
    ],
    ['"Use when  writing\nchangelogs"', "Use when writing changelogs"],
    ["", "Use when this procedure applies."],
  ])("%j -> %j", (input, expected) => {
    expect(toUseWhen(input)).toBe(expected);
  });
});

describe("buildMemoryFiles", () => {
  it("indexes every topic and skill file in MEMORY.md", () => {
    const files = buildMemoryFiles([
      group({}),
      group({
        groupId: "cluster-1-date-parser",
        taskId: null,
        label: "Fix the date parser",
        skills: [
          {
            name: "omit-aware-corpus",
            description: "Use when parsing dates",
            steps: ["a"],
          },
        ],
      }),
    ]);
    const paths = files.map((file) => file.path);
    expect(paths).toEqual([
      "MEMORY.md",
      "topics/build-word2vec-pipeline.md",
      "skills/omit-aware-corpus/SKILL.md",
      "topics/cluster-1-date-parser.md",
      "skills/omit-aware-corpus-2/SKILL.md",
    ]);
    const index = files[0]?.content ?? "";
    for (const file of paths.slice(1)) {
      expect(
        index.split("\n").filter((line) => line.includes(`](${file})`)),
      ).toHaveLength(1);
    }
  });

  it("writes skills with frontmatter and a Use when description", () => {
    const files = buildMemoryFiles([group({})]);
    const skill = files.find((file) => file.path.endsWith("SKILL.md"));
    expect(skill?.content).toMatch(
      /^---\nname: omit-aware-corpus\ndescription: "Use when builds a corpus\."\n---\n/,
    );
    expect(skill?.content).toContain("1. Read omit.txt");
  });

  it("lists superseded preferences and skips empty groups", () => {
    const files = buildMemoryFiles([
      group({
        instructions: [
          {
            text: "Format entries as one line.",
            kind: "preference",
            support: 1,
          },
        ],
        superseded: [
          {
            text: "Format entries as paragraphs.",
            supersededBy: "Format entries as one line.",
          },
        ],
        skills: [],
      }),
      group({ groupId: "empty", instructions: [], skills: [] }),
    ]);
    expect(files.map((file) => file.path)).toEqual([
      "MEMORY.md",
      "topics/build-word2vec-pipeline.md",
    ]);
    const topic = files[1]?.content ?? "";
    expect(topic).toContain("## User preferences (newest wins)");
    expect(topic).toContain("~~Format entries as paragraphs.~~");
  });

  it("redacts secrets and caps file size", () => {
    const many: MergedGroup["instructions"] = Array.from(
      { length: 200 },
      (_, i) => ({
        text: `Check invariant ${i} before you write output.`,
        kind: "procedure",
        support: 2,
      }),
    );
    const files = buildMemoryFiles(
      [
        group({
          instructions: many,
          skills: [
            {
              name: "setup",
              description: "Use when the API needs a key",
              steps: [
                "Export OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx first.",
              ],
            },
          ],
        }),
      ],
      2000,
    );
    const all = files.map((file) => file.content).join("\n");
    expect(all).not.toContain("sk-abcdefghijklmnopqrstuvwx");
    expect(all).toContain("[REDACTED]");
    for (const file of files) {
      expect(Buffer.byteLength(file.content)).toBeLessThanOrEqual(2000);
    }
  });
});

describe("MEMORY.md cap", () => {
  const many = Array.from({ length: 204 }, (_, i) =>
    group({
      groupId: `cluster-${i + 1}-synthetic`,
      taskId: null,
      label: `Synthetic cluster number ${i + 1} with a fairly long label`,
      runs: 1 + (i % 3),
      pass: i % 2,
      fail: 0,
      skills: [],
    }),
  );
  const known = group({ runs: 1, pass: 0 });

  it("keeps the index under the cap and says how many topics it left out", () => {
    const files = buildMemoryFiles([...many, known], 4000);
    const index = files[0]?.content ?? "";
    expect(files[0]?.path).toBe("MEMORY.md");
    expect(Buffer.byteLength(index)).toBeLessThanOrEqual(4000);
    // Every topic file is still written.
    expect(
      files.filter((file) => file.path.startsWith("topics/")),
    ).toHaveLength(205);
    const listed = index
      .split("\n")
      .filter((line) => line.includes("](topics/"));
    const note = index.match(
      /^- (\d+) more topics in topics\/ \(not listed\)$/m,
    );
    expect(Number(note?.[1])).toBe(205 - listed.length);
    // Skill lines fill what is left after the topic lines.
    expect(index).toContain("](skills/omit-aware-corpus/SKILL.md)");
  });

  it("lists known tasks first, then more runs, then more PASS runs", () => {
    const index = buildMemoryFiles([...many, known], 4000)[0]?.content ?? "";
    const listed = index
      .split("\n")
      .filter((line) => line.includes("](topics/"));
    expect(listed[0]).toContain("task `build-word2vec-pipeline`");
    const counts = listed.slice(1).map((line) => {
      const match = line.match(/(\d+) runs \((\d+) PASS/);
      return [Number(match?.[1]), Number(match?.[2])];
    });
    expect(counts.slice(0, 3)).toEqual([
      [3, 1],
      [3, 1],
      [3, 1],
    ]);
    expect(counts.at(-1)?.[0]).toBe(3);
  });

  it("never throws, even when the header is over the cap", () => {
    const index = buildMemoryFiles([known], 200)[0]?.content ?? "";
    expect(Buffer.byteLength(index)).toBeLessThanOrEqual(200);
  });

  it("lists everything when it fits", () => {
    const index = buildMemoryFiles([known])[0]?.content ?? "";
    expect(index).not.toContain("not listed");
  });
});

describe("writeMemoryFolder", () => {
  it("replaces a previous export but refuses a foreign folder", () => {
    const out = path.join(tmp, "memory");
    writeMemoryFolder(out, buildMemoryFiles([group({})]));
    writeMemoryFolder(out, buildMemoryFiles([group({ skills: [] })]));
    expect(readFileSync(path.join(out, "MEMORY.md"), "utf8")).not.toContain(
      "omit-aware-corpus",
    );
    writeFileSync(path.join(tmp, "notes.txt"), "keep me");
    expect(() => writeMemoryFolder(tmp, [])).toThrow(/refusing/);
  });
});
