import type { FunctionReturnType } from "convex/server";
import type { api, Doc } from "@vmem/backend";

export type SystemSkillEntry = FunctionReturnType<
  typeof api.systemSkills.listCatalog
>[number];

export type SkillVersionListEntry = FunctionReturnType<
  typeof api.skillVersions.list
>[number];

export type SkillViewFields = Pick<
  Doc<"skills">,
  "description" | "instructions"
>;

type SkillClipboardFields = Pick<
  Doc<"skills">,
  "name" | "description" | "instructions"
>;

function yamlScalar(value: string): string {
  if (/[\n:"'\\]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export function formatSkillForClipboard(skill: SkillClipboardFields): string {
  const trimmedInstructions = skill.instructions.trimStart();
  if (trimmedInstructions.startsWith("---")) {
    return skill.instructions;
  }

  const description = skill.description.trim();
  const lines = ["---", `name: ${yamlScalar(skill.name)}`];
  if (description.length > 0) {
    lines.push(`description: ${yamlScalar(description)}`);
  }
  lines.push("---", "", skill.instructions);
  return lines.join("\n");
}
