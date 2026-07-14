export interface SkillIndexEntry {
  name: string;
  description: string;
}

// skills menu: name + description only; full body loads via MCP skills_get
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
