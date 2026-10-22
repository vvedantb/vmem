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

/**
 * Pure: merged groups to memory files. Every topic and skill gets one
 * MEMORY.md line, skill names are unique, secrets are redacted, and no file
 * passes `maxFileBytes` (MEMORY.md throws instead, because truncating it
 * would drop index lines).
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

  for (const group of groups) {
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

  const index = [
    "# Memory",
    "",
    "Lessons mined from past agent runs on these tasks. Find the topic for your task, read it, and follow its instructions. Newer user preferences override older ones. Use a skill when its description matches your situation.",
    "",
    "## Topics",
    "",
    ...(topicLines.length > 0 ? topicLines : ["(none)"]),
    "",
    "## Skills",
    "",
    ...(skillLines.length > 0 ? skillLines : ["(none)"]),
    "",
  ].join("\n");

  const capped = files.map((file) => ({
    path: file.path,
    content: capSize(redactSecrets(file.content), maxFileBytes),
  }));
  const indexContent = redactSecrets(index);
  if (Buffer.byteLength(indexContent) > maxFileBytes) {
    throw new Error(
      `${INDEX_FILE} is over the ${maxFileBytes} byte cap; raise --max-file-bytes or limit tasks`,
    );
  }
  return [{ path: INDEX_FILE, content: indexContent }, ...capped];
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
