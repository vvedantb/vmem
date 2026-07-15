import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import { patchSkillListMy } from "./_utils";

type UpdateSkillArgs = FunctionArgs<typeof api.skills.updateSkill>;
type DeleteSkillArgs = FunctionArgs<typeof api.skills.deleteSkill>;
type DeleteSkillsArgs = FunctionArgs<typeof api.skills.deleteSkills>;

export function optimisticUpdateSkillList(
  localStore: OptimisticLocalStore,
  teamId: Id<"teams"> | undefined,
  args: UpdateSkillArgs,
): void {
  const current = localStore.getQuery(api.skills.listMy, { teamId });
  if (!current) return;
  localStore.setQuery(
    api.skills.listMy,
    { teamId },
    patchSkillListMy(current, args.id, args),
  );
}

export function optimisticDeleteSkillFromList(
  localStore: OptimisticLocalStore,
  teamId: Id<"teams"> | undefined,
  args: DeleteSkillArgs,
): void {
  const current = localStore.getQuery(api.skills.listMy, { teamId });
  if (!current) return;
  localStore.setQuery(
    api.skills.listMy,
    { teamId },
    current.filter((row) => row._id !== args.id),
  );
}

export function optimisticDeleteSkillsFromList(
  localStore: OptimisticLocalStore,
  teamId: Id<"teams"> | undefined,
  args: DeleteSkillsArgs,
): void {
  const current = localStore.getQuery(api.skills.listMy, { teamId });
  if (!current) return;
  const removeSet = new Set(args.ids);
  localStore.setQuery(
    api.skills.listMy,
    { teamId },
    current.filter((skill) => !removeSet.has(skill._id)),
  );
}
