export interface MemoryRagCandidate {
  id: string;
  title: string;
  content: string;
  trace?: {
    reason: string;
  };
}

export interface SkillIndexEntry {
  name: string;
  description: string;
}

export interface SkillPromptEntry extends SkillIndexEntry {
  instructions: string;
  enabled?: boolean;
}

const CONTENT_PREVIEW_MAX = 900;

function truncateContent(text: string): string {
  const t = text.trim();
  if (t.length <= CONTENT_PREVIEW_MAX) return t;
  return `${t.slice(0, CONTENT_PREVIEW_MAX)}…`;
}

export function buildMemoryRagAddition(
  candidates: MemoryRagCandidate[],
): string {
  if (candidates.length === 0) return "";

  const lines: string[] = [
    "Relevant memories retrieved for this turn (ground your answer in these when they apply; if none fit, say so):",
    "",
  ];

  for (const m of candidates) {
    const preview = truncateContent(m.content);
    const traceLine = m.trace?.reason
      ? ` Match context: ${m.trace.reason}`
      : "";
    lines.push(`[${m.id}] ${m.title}`);
    lines.push(preview);
    if (traceLine) lines.push(traceLine.trim());
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function filterEnabledSkills(
  skills: SkillPromptEntry[],
): SkillPromptEntry[] {
  return skills.filter((skill) => skill.enabled !== false);
}

/**
 * Claude-style skills menu: name + description only. Full instructions are
 * loaded lazily via MCP `skills_get` or by name match in local chat.
 */
export function buildSkillsIndexAddition(
  entries: SkillIndexEntry[],
  options: { mcpClient: boolean },
): string {
  if (entries.length === 0) return "";

  const lines: string[] = [
    "Available skills (check whether the user's request matches any description before answering):",
    "",
  ];

  if (options.mcpClient) {
    lines.push(
      "Call `context_prompt_get` (or read `vmem://context_prompt` at session start) for profile + this skills index.",
      "When a skill applies, call `skills_get` with its exact name to load full markdown instructions, then follow them.",
      "When you identified a repeatable problem or automatable workflow and no skill above covers it yet, call `skills_create` (after confirming with `skills_list` if needed).",
      "When an existing skill's playbook should change, call `skills_get` then `skills_update` with the current name and patched fields.",
    );
  } else {
    lines.push(
      "This session has no MCP tools. When the user names a skill or a task clearly matches one, follow the loaded skill instructions section below if present.",
    );
  }

  lines.push("");
  for (const skill of entries) {
    lines.push(`- **${skill.name}**: ${skill.description}`);
  }

  return lines.join("\n").trimEnd();
}

/** Local chat pulls full instructions when the user message mentions a skill by name. */
export function findSkillsReferencedInMessage(
  skills: SkillPromptEntry[],
  userMessage: string,
): SkillPromptEntry[] {
  const lower = userMessage.toLowerCase();
  return skills.filter((skill) => lower.includes(skill.name.toLowerCase()));
}

export function buildSkillInstructionsAddition(
  skills: SkillPromptEntry[],
): string {
  if (skills.length === 0) return "";

  const lines: string[] = ["Loaded skill instructions (follow these):", ""];

  for (const skill of skills) {
    lines.push(`## Skill: ${skill.name}`);
    const body = skill.instructions.trim();
    lines.push(body.length > 0 ? body : "_(no instructions)_");
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function buildLocalChatSystemPrompt(params: {
  core: string;
  memoryCandidates: MemoryRagCandidate[];
  skills: SkillPromptEntry[];
  userMessage: string;
}): string {
  const enabled = filterEnabledSkills(params.skills);
  const index = buildSkillsIndexAddition(
    enabled.map(({ name, description }) => ({ name, description })),
    { mcpClient: false },
  );
  const referenced = findSkillsReferencedInMessage(enabled, params.userMessage);
  const skillBody = buildSkillInstructionsAddition(referenced);
  const memory = buildMemoryRagAddition(params.memoryCandidates);

  return composeSystemPrompt(params.core, index, skillBody, memory);
}

export const VMEM_CLOUD_CHAT_CORE = [
  "You are vmem, a memory assistant that helps users store, search, and recall their personal memories.",
  "You are running on a cloud model via OpenRouter with read-only access to vmem tools (memories, skills, wiki, codebases).",
  "Use memory_search and memory_retrieve to find relevant memories before answering factual questions about the user.",
  "If the user asks you to remember, update, or delete something, explain that cloud chat currently requires the user to make that change through the app or an MCP client.",
  "When the Available skills section is present, check whether the user's request matches any skill before answering.",
  "When a skill applies, call skills_get with its exact name to load full instructions, then follow them.",
  "Be concise and helpful. Reference specific memories when answering.",
].join(" ");

export function buildCloudChatSystemPrompt(params: {
  skills: SkillIndexEntry[];
}): string {
  const index = buildSkillsIndexAddition(params.skills, { mcpClient: true });
  return composeSystemPrompt(VMEM_CLOUD_CHAT_CORE, index);
}

export const VMEM_LOCAL_CHAT_CORE = [
  "You are vmem, a memory assistant that helps users store, search, and recall their personal memories.",
  "You are currently running locally on the user's device with limited capabilities.",
  "When the Available skills section is present, check whether the user's request matches any skill before answering.",
  "When the Relevant memories section is present below, use it to answer accurately; if it is missing, incomplete, or not applicable, say so clearly and help with general guidance where appropriate.",
  "Be concise and helpful.",
].join(" ");

export const VMEM_VOICE_SPOKEN_SUFFIX =
  " Keep responses short since they will be spoken aloud.";

export const VMEM_VOICE_CORE = VMEM_LOCAL_CHAT_CORE + VMEM_VOICE_SPOKEN_SUFFIX;

export function composeSystemPrompt(
  core: string,
  ...additions: string[]
): string {
  const nonEmpty = additions.filter((addition) => addition.length > 0);
  if (nonEmpty.length === 0) return core;
  return [core, ...nonEmpty].join("\n\n");
}
