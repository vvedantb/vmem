import type { FunctionReturnType } from "convex/server";
import type { api, Doc, Id } from "@vmem/backend";

export type SystemSkillEntry = FunctionReturnType<
  typeof api.systemSkills.listCatalog
>[number];

export type SkillListRow = FunctionReturnType<typeof api.skills.listMy>[number];

export type SkillVersionListEntry = FunctionReturnType<
  typeof api.skillVersions.list
>[number];

export type SkillVersionDetail = NonNullable<
  FunctionReturnType<typeof api.skillVersions.get>
>;

export type SkillUpdatePatch = {
  name?: string;
  description?: string;
  instructions?: string;
  enabled?: boolean;
};

export type SkillViewFields = Pick<
  Doc<"skills">,
  "description" | "instructions"
>;

type SkillClipboardFields = Pick<
  Doc<"skills">,
  "name" | "description" | "instructions"
>;

export function patchSystemSkillCatalog(
  rows: SystemSkillEntry[],
  id: SystemSkillEntry["_id"],
  change: Partial<SystemSkillEntry>,
): SystemSkillEntry[] {
  return rows.map((entry) =>
    entry._id === id ? { ...entry, ...change } : entry,
  );
}

export function patchSkillListMy(
  rows: SkillListRow[],
  id: string,
  patch: SkillUpdatePatch,
): SkillListRow[] {
  const now = Date.now();
  return rows.map((row) => {
    if (row._id !== id) return row;
    return {
      ...row,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
      ...(patch.instructions !== undefined
        ? { instructions: patch.instructions }
        : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      updatedAt: now,
    };
  });
}

export function prependOptimisticSkillRow(
  rows: SkillListRow[],
  tempId: Id<"skills">,
  fields: Pick<SkillUpdatePatch, "name" | "description" | "instructions"> & {
    name: string;
    description: string;
    instructions: string;
  },
): SkillListRow[] {
  const head = rows.at(0);
  if (!head) return rows;
  const now = Date.now();
  return [
    {
      ...head,
      _id: tempId,
      _creationTime: now,
      name: fields.name.trim(),
      description: fields.description,
      instructions: fields.instructions,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    ...rows,
  ];
}

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
