import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { head, redactSecrets, slugify } from "./text.ts";
import type { LessonKind, MergedGroup, SkillDefinition } from "./types.ts";

interface MemoryFile {
  /** Relative to the memory folder, POSIX separators. */
  path: string;
  content: string;
}

export const DEFAULT_MAX_FILE_BYTES = 16_000;
const INDEX_FILE = "MEMORY.md";
const HOOK_CHARS = 160;
const TRUNCATED_NOTE = "\n(truncated: size cap)\n";

const SECTIONS: readonly { kind: LessonKind; title: string }[] = [
  { kind: "preference", title: "User preferences (newest wins)" },
  { kind: "procedure", title: "How to do it" },
  { kind: "pitfall", title: "Pitfalls" },
  { kind: "fact", title: "Environment facts" },
];

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Skill descriptions must be imperative and start with "Use when". */
export function toUseWhen(description: string): string {
  const text = oneLine(description).replace(/^["']+|["']+$/g, "");
  const rest = text.replace(/^use when\b[:,]?\s*/i, "");
  const body =
    rest === text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : rest;
  return `Use when ${body || "this procedure applies."}`;
}

function capSize(content: string, maxBytes: number): string {
  if (Buffer.byteLength(content) <= maxBytes) return content;
  const budget = maxBytes - Buffer.byteLength(TRUNCATED_NOTE);
  const lines = content.split("\n");
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const size = Buffer.byteLength(line) + 1;
    if (used + size > budget) break;
    kept.push(line);
    used += size;
  }
  return `${kept.join("\n")}${TRUNCATED_NOTE}`;
}

function topicContent(
  group: MergedGroup,
  skillPaths: readonly { name: string; file: string }[],
): string {
  const lines = [
    `# ${oneLine(group.label)}`,
    "",
    group.taskId
      ? `Task id: \`${group.taskId}\`.`
      : "Task: unmatched cluster of similar past runs.",
    `Learned from ${group.runs} past runs (${group.pass} PASS, ${group.fail} FAIL). Follow these instructions.`,
  ];
  for (const section of SECTIONS) {
    const items = group.instructions.filter(
      (item) => item.kind === section.kind,
    );
    if (items.length === 0) continue;
    lines.push("", `## ${section.title}`, "");
    for (const item of items) lines.push(`- ${oneLine(item.text)}`);
  }
  if (group.superseded.length > 0) {
    lines.push("", "## Superseded preferences (do not follow)", "");
    for (const item of group.superseded) {
      lines.push(
        `- ~~${oneLine(item.text)}~~ Replaced by: ${oneLine(item.supersededBy)}`,
      );
    }
  }
  if (skillPaths.length > 0) {
    lines.push("", "## Skills", "");
    for (const skill of skillPaths) {
      lines.push(`- [${skill.name}](../${skill.file})`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function skillContent(skill: SkillDefinition): string {
  // JSON strings are valid YAML double-quoted scalars.
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    "",
    `# ${skill.name}`,
    "",
    skill.description,
    "",
    "## Steps",
    "",
    ...skill.steps.map((step, i) => `${i + 1}. ${oneLine(step)}`),
    "",
  ].join("\n");
}

const INDEX_INTRO =
  "Lessons mined from past agent runs on these tasks. Find the topic for your task, read it, and follow its instructions. Newer user preferences override older ones. Use a skill when its description matches your situation.";

/** Known-task groups first, then more runs, then more PASS runs. Stable. */
function byIndexPriority(a: MergedGroup, b: MergedGroup): number {
  return (
    Number(b.taskId !== null) - Number(a.taskId !== null) ||
    b.runs - a.runs ||
    b.pass - a.pass
  );
}

function renderIndex(
  topics: readonly string[],
  topicTotal: number,
  skills: readonly string[],
  skillTotal: number,
): string {
  const section = (
    title: string,
    lines: readonly string[],
    total: number,
    dir: string,
  ) => [
    `## ${title}`,
    "",
    ...(total === 0 ? ["(none)"] : lines),
    ...(lines.length < total
      ? [`- ${total - lines.length} more ${dir} in ${dir}/ (not listed)`]
      : []),
    "",
  ];
  return [
    "# Memory",
    "",
    INDEX_INTRO,
    "",
    ...section("Topics", topics, topicTotal, "topics"),
    ...section("Skills", skills, skillTotal, "skills"),
  ].join("\n");
}

/**
 * MEMORY.md within `maxBytes`: the longest prefix of topic lines that fits,
 * then of skill lines, each cut list ending with a "N more" note.
 */
function fitIndex(
  topicLines: readonly string[],
  skillLines: readonly string[],
  maxBytes: number,
): string {
  const render = (topics: number, skills: number) =>
    renderIndex(
      topicLines.slice(0, topics),
      topicLines.length,
      skillLines.slice(0, skills),
      skillLines.length,
    );
  const fits = (topics: number, skills: number) =>
    Buffer.byteLength(render(topics, skills)) <= maxBytes;
  let topics = 0;
  while (topics < topicLines.length && fits(topics + 1, 0)) topics += 1;
  let skills = 0;
  while (skills < skillLines.length && fits(topics, skills + 1)) skills += 1;
  // capSize only bites when the fixed header alone is over the cap.
  return capSize(render(topics, skills), maxBytes);
}

/**
 * Pure: merged groups to memory files. Every topic and skill gets one
 * MEMORY.md line while it fits, skill names are unique, secrets are redacted,
 * and no file passes `maxFileBytes`. MEMORY.md lists the most useful groups
 * first (see `byIndexPriority`) and drops the rest with a "N more" note.
 */
export function buildMemoryFiles(
  groups: readonly MergedGroup[],
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
): MemoryFile[] {
  const files: MemoryFile[] = [];
  const topicLines: string[] = [];
  const skillLines: string[] = [];
  const usedSkillNames = new Set<string>();
  const usedTopics = new Set<string>();

  for (const group of [...groups].sort(byIndexPriority)) {
    if (group.instructions.length === 0 && group.superseded.length === 0) {
      continue;
    }
    const skills = group.skills.map((skill) => {
      const base = slugify(skill.name, 48);
      let name = base;
      for (let n = 2; usedSkillNames.has(name); n += 1) name = `${base}-${n}`;
      usedSkillNames.add(name);
      return {
        name,
        description: toUseWhen(skill.description),
        steps: skill.steps,
      };
    });
    const skillPaths = skills.map((skill) => ({
      name: skill.name,
      file: `skills/${skill.name}/SKILL.md`,
    }));
    let slug = slugify(group.groupId, 64);
    for (let n = 2; usedTopics.has(slug); n += 1) {
      slug = `${slugify(group.groupId, 60)}-${n}`;
    }
    usedTopics.add(slug);
    const topicPath = `topics/${slug}.md`;
    files.push({ path: topicPath, content: topicContent(group, skillPaths) });
    const taskNote = group.taskId ? `task \`${group.taskId}\`, ` : "";
    topicLines.push(
      `- [${head(oneLine(group.label), 80)}](${topicPath}): ${taskNote}${group.runs} runs (${group.pass} PASS, ${group.fail} FAIL)`,
    );
    skills.forEach((skill, i) => {
      const file = skillPaths[i]?.file ?? `skills/${skill.name}/SKILL.md`;
      files.push({ path: file, content: skillContent(skill) });
      skillLines.push(
        `- [${skill.name}](${file}): ${head(skill.description, HOOK_CHARS)}`,
      );
    });
  }

  const capped = files.map((file) => ({
    path: file.path,
    content: capSize(redactSecrets(file.content), maxFileBytes),
  }));
  const index = fitIndex(
    topicLines.map(redactSecrets),
    skillLines.map(redactSecrets),
    maxFileBytes,
  );
  return [{ path: INDEX_FILE, content: index }, ...capped];
}

/**
 * Writes the folder. A folder that already holds a MEMORY.md is treated as a
 * previous export and replaced. Any other non-empty folder is refused.
 */
export function writeMemoryFolder(
  outDir: string,
  files: readonly MemoryFile[],
): void {
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    if (!existsSync(path.join(outDir, INDEX_FILE))) {
      throw new Error(
        `${outDir} is not empty and has no ${INDEX_FILE}; refusing to overwrite it`,
      );
    }
    for (const entry of [INDEX_FILE, "topics", "skills"]) {
      rmSync(path.join(outDir, entry), { recursive: true, force: true });
    }
  }
  for (const file of files) {
    const target = path.join(outDir, ...file.path.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
}
