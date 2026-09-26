import type { MemoryCandidate } from "@vmem/sdk";
import { truncateAtWord } from "../llm/truncateAtWord";
import type { SkillIndexSlice } from "./jevSkillRecommend";

// One bounded markdown bundle an agent can load at task start instead of
// chaining context_prompt_get, memory_retrieve, and skills_recommend.
// Sections are filled in priority order: task memories, skills, profile.

export const CONTEXT_PACK_DEFAULT_CHARS = 8000;
export const CONTEXT_PACK_MIN_CHARS = 1000;
export const CONTEXT_PACK_MAX_CHARS = 32000;
const MEMORY_CONTENT_CHARS = 600;
// below this the profile tail is noise, so it is left out
const MIN_PROFILE_CHARS = 200;
// the context prompt ends with its own skills index; the pack has a task-fit one
const PROFILE_SKILLS_HEADING = "\n## Available Skills";

export interface ContextPack {
  markdown: string;
  memoryIds: string[];
  skillNames: string[];
  includesProfile: boolean;
  truncated: boolean;
}

function clip(text: string, maxLen: number): string {
  const cut = truncateAtWord(text, maxLen);
  return cut.length < text.length ? `${cut}…` : cut;
}

function memoryLine(memory: MemoryCandidate): string {
  return [
    `- **${memory.title}** (id: ${memory.id}, ${memory.type}) — ${clip(memory.content, MEMORY_CONTENT_CHARS)}`,
    `  _why: ${memory.trace.reason}_`,
  ].join("\n");
}

function stripProfileSkills(profile: string): string {
  const index = profile.indexOf(PROFILE_SKILLS_HEADING);
  return (index < 0 ? profile : profile.slice(0, index)).trim();
}

export function buildContextPack(args: {
  task: string;
  memories: readonly MemoryCandidate[];
  skills: readonly SkillIndexSlice[];
  profile: string | null;
  maxChars: number;
}): ContextPack {
  // sections join with a blank line, lines within a section with "\n";
  // `used` is the exact length of the markdown built so far
  const header = `# vmem context pack\n\nTask: ${args.task}`;
  const sections: string[] = [header];
  let used = header.length;
  let truncated = false;
  const fits = (extra: number): boolean => used + extra <= args.maxChars;

  const memoryIds: string[] = [];
  const memoryLines: string[] = ["## Relevant memories"];
  used += 2 + "## Relevant memories".length;
  for (const memory of args.memories) {
    const line = memoryLine(memory);
    // the top hit always ships so a tight budget never empties the pack
    if (memoryIds.length > 0 && !fits(1 + line.length)) {
      truncated = true;
      break;
    }
    memoryLines.push(line);
    memoryIds.push(memory.id);
    used += 1 + line.length;
  }
  if (memoryIds.length === 0) {
    const empty = "_No relevant memories found._";
    memoryLines.push(empty);
    used += 1 + empty.length;
  }
  sections.push(memoryLines.join("\n"));

  const skillNames: string[] = [];
  const skillHead = [
    "## Suggested skills",
    "Call `skills_get` with the exact name before following a playbook.",
  ].join("\n");
  const skillLines: string[] = [skillHead];
  for (const skill of args.skills) {
    const line = `- **${skill.name}**: ${clip(skill.description, 240)}`;
    const headCost = skillNames.length === 0 ? 2 + skillHead.length : 0;
    if (!fits(headCost + 1 + line.length)) {
      truncated = true;
      break;
    }
    skillLines.push(line);
    skillNames.push(skill.name);
    used += headCost + 1 + line.length;
  }
  if (skillNames.length > 0) sections.push(skillLines.join("\n"));

  let includesProfile = false;
  const profile = args.profile === null ? "" : stripProfileSkills(args.profile);
  if (profile.length > 0) {
    const room = args.maxChars - used - 2;
    if (room >= MIN_PROFILE_CHARS) {
      // clip appends "…", so leave one char for it
      const body = profile.length <= room ? profile : clip(profile, room - 1);
      if (body.length < profile.length) truncated = true;
      sections.push(body);
      includesProfile = true;
    } else {
      truncated = true;
    }
  }

  return {
    markdown: sections.join("\n\n"),
    memoryIds,
    skillNames,
    includesProfile,
    truncated,
  };
}
