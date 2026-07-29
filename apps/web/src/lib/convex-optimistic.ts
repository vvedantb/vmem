import type { OptimisticLocalStore } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { api, type Id, type TableNames } from "@vmem/backend";
import { collectSubtreeIds } from "@/components/wiki/_utils";

// branded id has no public constructor so optimistic inserts need a cast here
// this is the only place in the app that fabricates placeholder ids
export function tempId<T extends TableNames>(): Id<T> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Id<T> is a branded string; there is no way to construct one without a cast
  return crypto.randomUUID() as Id<T>;
}

// patches every cached copy of a query, add named wrappers only at 2+ call sites
export function updateAllCachedQueries<
  Query extends FunctionReference<"query">,
>(
  localStore: OptimisticLocalStore,
  query: Query,
  mapFn: (value: FunctionReturnType<Query>) => FunctionReturnType<Query>,
): void {
  for (const entry of localStore.getAllQueries(query)) {
    if (entry.value === undefined) continue;
    localStore.setQuery(query, entry.args, mapFn(entry.value));
  }
}

type UserSettingsPatch = FunctionArgs<typeof api.userSettings.update>;

export function patchUserSettingsGet(
  localStore: OptimisticLocalStore,
  patch: UserSettingsPatch,
): void {
  const current = localStore.getQuery(api.userSettings.get, {});
  if (current === undefined) return;
  localStore.setQuery(
    api.userSettings.get,
    {},
    {
      ...current,
      ...patch,
    },
  );
}

export function patchDefaultProfile(
  localStore: OptimisticLocalStore,
  source: "web" | "extension" | "mcp",
  profileId: Id<"profiles">,
): void {
  const current = localStore.getQuery(api.userSettings.get, {});
  if (current !== undefined) {
    localStore.setQuery(
      api.userSettings.get,
      {},
      {
        ...current,
        defaultProfiles: {
          ...current.defaultProfiles,
          [source]: profileId,
        },
      },
    );
  }
  const defaultForSource = localStore.getQuery(
    api.userSettings.getDefaultProfile,
    { source },
  );
  if (defaultForSource !== undefined) {
    localStore.setQuery(
      api.userSettings.getDefaultProfile,
      { source },
      profileId,
    );
  }
}

// skills each below has 2+ callers restoreVersion has one and inlines
// updateAllCachedQueries directly at its call site instead of living here.
type SkillUpdateArgs = FunctionArgs<typeof api.skills.updateSkill>;
type SkillCreateArgs = FunctionArgs<typeof api.skills.createSkill>;

export function patchSkillInLists(
  localStore: OptimisticLocalStore,
  args: SkillUpdateArgs,
): void {
  updateAllCachedQueries(localStore, api.skills.listMy, (skills) =>
    skills.map((s) =>
      s._id === args.id
        ? {
            ...s,
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.description !== undefined
              ? { description: args.description }
              : {}),
            ...(args.instructions !== undefined
              ? { instructions: args.instructions }
              : {}),
            ...(args.enabled !== undefined ? { enabled: args.enabled } : {}),
          }
        : s,
    ),
  );
}

export function removeSkillsFromLists(
  localStore: OptimisticLocalStore,
  // plain string or branded skill id so both delete mutations share one helper
  ids: Iterable<string>,
): void {
  const remove = new Set(ids);
  updateAllCachedQueries(localStore, api.skills.listMy, (skills) =>
    skills.filter((s) => !remove.has(s._id)),
  );
}

// used by both WriteSkillDialog and UploadSkillDialog same optimistic
// insert, only the args source (form vs. parsed file) differs
export function insertSkillInLists(
  localStore: OptimisticLocalStore,
  args: SkillCreateArgs,
): void {
  const now = Date.now();
  const newId = tempId<"skills">();
  for (const entry of localStore.getAllQueries(api.skills.listMy)) {
    if (entry.value === undefined) continue;
    if (entry.args.teamId !== args.teamId) continue;
    localStore.setQuery(api.skills.listMy, entry.args, [
      {
        _id: newId,
        _creationTime: now,
        userId: entry.value[0]?.userId ?? tempId<"users">(),
        teamId: args.teamId,
        name: args.name,
        description: args.description,
        instructions: args.instructions,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      ...entry.value,
    ]);
  }
}

// system skills (admin catalog) install/uninstall/setEnabled share this one
// shape at 3 call sites in SystemSkillDetail adminCreate/Update/Delete each
// have one caller and inline updateAllCachedQueries at their call site.
type SystemSkillList = FunctionReturnType<typeof api.systemSkills.listCatalog>;
type SystemSkillEntry = SystemSkillList[number];

export function setSystemSkillInstallState(
  localStore: OptimisticLocalStore,
  systemSkillId: Id<"systemSkills">,
  patch: Partial<Pick<SystemSkillEntry, "installed" | "installEnabled">>,
): void {
  updateAllCachedQueries(localStore, api.systemSkills.listCatalog, (list) =>
    list.map((s) => (s._id === systemSkillId ? { ...s, ...patch } : s)),
  );
}

// rename and subtree delete each have two callers so they live here
// moveNode has one caller and inlines updateAllCachedQueries at its site
type WikiRenameArgs = FunctionArgs<typeof api.wiki.renameNode>;

export function renameWikiNodeInLists(
  localStore: OptimisticLocalStore,
  args: WikiRenameArgs,
): void {
  updateAllCachedQueries(localStore, api.wiki.listTree, (nodes) =>
    nodes.map((n) => (n._id === args.id ? { ...n, title: args.title } : n)),
  );
  for (const entry of localStore.getAllQueries(api.wiki.getNode)) {
    if (entry.value == null || entry.value._id !== args.id) continue;
    localStore.setQuery(api.wiki.getNode, entry.args, {
      ...entry.value,
      title: args.title,
    });
  }
}

export function removeWikiNodesFromLists(
  localStore: OptimisticLocalStore,
  ids: Iterable<Id<"wikiNodes">>,
): void {
  const idList = [...ids];
  for (const entry of localStore.getAllQueries(api.wiki.listTree)) {
    if (entry.value === undefined) continue;
    const remove = collectSubtreeIds(entry.value, idList);
    localStore.setQuery(
      api.wiki.listTree,
      entry.args,
      entry.value.filter((n) => !remove.has(n._id)),
    );
  }
  for (const entry of localStore.getAllQueries(api.wiki.getNode)) {
    if (idList.some((id) => id === entry.args.id)) {
      localStore.setQuery(api.wiki.getNode, entry.args, undefined);
    }
  }
}
