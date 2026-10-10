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
  mapFn: (
    value: FunctionReturnType<Query>,
    args: FunctionArgs<Query>,
  ) => FunctionReturnType<Query>,
): void {
  for (const entry of localStore.getAllQueries(query)) {
    if (entry.value === undefined) continue;
    localStore.setQuery(query, entry.args, mapFn(entry.value, entry.args));
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

type MemoryListArgs = FunctionArgs<typeof api.memoryApi.listMemories>;
type MemoryRow = FunctionReturnType<
  typeof api.memoryApi.listMemories
>["memories"][number];
type MemoryCreateArgs = FunctionArgs<typeof api.memoryApi.createMemory>;
type MemoryUpdateArgs = FunctionArgs<typeof api.memoryApi.updateMemory>;

function visibleMemoryStatus(status: string | undefined): boolean {
  return status === undefined || status === "active" || status === "pinned";
}

function memoryMatchesListArgs(
  memory: Pick<
    MemoryRow,
    "profileId" | "type" | "source" | "status" | "tags" | "title" | "content"
  >,
  args: MemoryListArgs,
): boolean {
  if (
    args.profileId !== undefined &&
    memory.profileId !== null &&
    memory.profileId !== args.profileId
  ) {
    return false;
  }
  if (args.type !== undefined && memory.type !== args.type) return false;
  if (args.source !== undefined && memory.source !== args.source) return false;
  if (args.status !== undefined) {
    if (memory.status !== args.status) return false;
  } else if (!visibleMemoryStatus(memory.status)) {
    return false;
  }
  if (args.tags !== undefined && args.tags.length > 0) {
    const have = new Set(memory.tags);
    if (!args.tags.every((tag) => have.has(tag))) return false;
  }
  const needle = args.searchQuery?.trim().toLowerCase();
  if (needle !== undefined && needle.length > 0) {
    const haystack =
      `${memory.title} ${memory.content} ${memory.tags.join(" ")}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function optimisticMemoryFromCreate(args: MemoryCreateArgs): MemoryRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId: "",
    profileId: args.profileId ?? null,
    title: args.title,
    content: args.content,
    type: args.type,
    source: args.source,
    sourceType: args.sourceType ?? args.source,
    sourceId: args.externalId ?? null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: args.confidence,
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt: args.expiresAt ?? null,
    tags: args.tags,
  };
}

export function insertMemoryInLists(
  localStore: OptimisticLocalStore,
  args: MemoryCreateArgs,
): void {
  const created = optimisticMemoryFromCreate(args);
  for (const entry of localStore.getAllQueries(api.memoryApi.listMemories)) {
    if (entry.value === undefined) continue;
    if (!memoryMatchesListArgs(created, entry.args)) continue;
    const offset = entry.args.offset;
    const nextMemories =
      offset === 0
        ? [created, ...entry.value.memories].slice(0, entry.args.limit)
        : entry.value.memories;
    localStore.setQuery(api.memoryApi.listMemories, entry.args, {
      memories: nextMemories,
      total: entry.value.total + 1,
    });
  }
}

export function patchMemoryInLists(
  localStore: OptimisticLocalStore,
  args: MemoryUpdateArgs,
): void {
  const patchRow = (row: MemoryRow): MemoryRow =>
    row.id !== args.memoryId
      ? row
      : {
          ...row,
          ...(args.title !== undefined ? { title: args.title } : {}),
          ...(args.content !== undefined ? { content: args.content } : {}),
          ...(args.type !== undefined ? { type: args.type } : {}),
          ...(args.status !== undefined ? { status: args.status } : {}),
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
          ...(args.confidence !== undefined
            ? { confidence: args.confidence }
            : {}),
          ...(args.expiresAt !== undefined
            ? { expiresAt: args.expiresAt }
            : {}),
          updatedAt: new Date().toISOString(),
        };

  updateAllCachedQueries(
    localStore,
    api.memoryApi.listMemories,
    (page, args) => {
      const memories = page.memories
        .map(patchRow)
        .filter((row) => memoryMatchesListArgs(row, args));
      const removed = page.memories.length - memories.length;
      return {
        memories,
        total: Math.max(0, page.total - removed),
      };
    },
  );

  for (const entry of localStore.getAllQueries(api.memoryApi.getMemory)) {
    if (entry.value == null || entry.value.id !== args.memoryId) continue;
    localStore.setQuery(
      api.memoryApi.getMemory,
      entry.args,
      patchRow(entry.value),
    );
  }
}

export function removeMemoryFromLists(
  localStore: OptimisticLocalStore,
  memoryId: string,
): void {
  updateAllCachedQueries(localStore, api.memoryApi.listMemories, (page) => {
    const memories = page.memories.filter((row) => row.id !== memoryId);
    const removed = page.memories.length - memories.length;
    return {
      memories,
      total: Math.max(0, page.total - removed),
    };
  });
  for (const entry of localStore.getAllQueries(api.memoryApi.getMemory)) {
    if (entry.args.memoryId === memoryId || entry.value?.id === memoryId) {
      localStore.setQuery(api.memoryApi.getMemory, entry.args, null);
    }
  }
}

type PollResults = FunctionReturnType<typeof api.presentations.pollResults>;

function bumpPollOption(
  results: PollResults,
  optionId: string,
  delta: number,
): PollResults {
  const options = results.options.map((option) =>
    option.optionId === optionId
      ? { ...option, count: Math.max(0, option.count + delta) }
      : option,
  );
  if (!options.some((option) => option.optionId === optionId) && delta > 0) {
    options.push({ optionId, count: delta });
  }
  return {
    options: options.filter((option) => option.count > 0),
    total: Math.max(0, results.total + delta),
  };
}

export function applySendVoteOptimistic(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.presentations.sendVote>,
): void {
  const selectionArgs = {
    code: args.code,
    pollId: args.pollId,
    participantKey: args.participantKey,
  };
  const previous = localStore.getQuery(
    api.presentations.getMyPollSelections,
    selectionArgs,
  );
  if (previous !== undefined) {
    localStore.setQuery(api.presentations.getMyPollSelections, selectionArgs, [
      args.optionId,
    ]);
  }
  const resultArgs = { code: args.code, pollId: args.pollId };
  const results = localStore.getQuery(
    api.presentations.pollResults,
    resultArgs,
  );
  if (results === undefined) return;
  let next = results;
  for (const optionId of previous ?? []) {
    next = bumpPollOption(next, optionId, -1);
  }
  next = bumpPollOption(next, args.optionId, 1);
  localStore.setQuery(api.presentations.pollResults, resultArgs, next);
}

export function applyTogglePollOptionOptimistic(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.presentations.togglePollOption>,
): void {
  const selectionArgs = {
    code: args.code,
    pollId: args.pollId,
    participantKey: args.participantKey,
  };
  const previous = localStore.getQuery(
    api.presentations.getMyPollSelections,
    selectionArgs,
  );
  const selected = new Set(previous ?? []);
  const turningOff = selected.has(args.optionId);
  if (previous !== undefined) {
    if (turningOff) selected.delete(args.optionId);
    else selected.add(args.optionId);
    localStore.setQuery(api.presentations.getMyPollSelections, selectionArgs, [
      ...selected,
    ]);
  }
  const resultArgs = { code: args.code, pollId: args.pollId };
  const results = localStore.getQuery(
    api.presentations.pollResults,
    resultArgs,
  );
  if (results === undefined) return;
  localStore.setQuery(
    api.presentations.pollResults,
    resultArgs,
    bumpPollOption(results, args.optionId, turningOff ? -1 : 1),
  );
}

export function applyClearPollVotesOptimistic(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.presentations.clearPollVotes>,
): void {
  const resultArgs = { code: args.code, pollId: args.pollId };
  if (
    localStore.getQuery(api.presentations.pollResults, resultArgs) !== undefined
  ) {
    localStore.setQuery(api.presentations.pollResults, resultArgs, {
      options: [],
      total: 0,
    });
  }
  for (const entry of localStore.getAllQueries(
    api.presentations.getMyPollSelections,
  )) {
    if (entry.args.code !== args.code || entry.args.pollId !== args.pollId) {
      continue;
    }
    localStore.setQuery(api.presentations.getMyPollSelections, entry.args, []);
  }
}

export function applySetSlideOptimistic(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.presentations.setSlide>,
): void {
  const current = localStore.getQuery(api.presentations.getSession, {
    code: args.code,
  });
  if (current == null) return;
  localStore.setQuery(
    api.presentations.getSession,
    { code: args.code },
    { ...current, slide: args.slide },
  );
}

export function applyStopSharingOptimistic(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.presentations.stopSharing>,
): void {
  const current = localStore.getQuery(api.presentations.getSession, {
    code: args.code,
  });
  if (current == null) return;
  localStore.setQuery(
    api.presentations.getSession,
    { code: args.code },
    { ...current, status: "ended" },
  );
}

export function insertCreatedTeamInLists(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.teams.create>,
): void {
  const now = Date.now();
  const teamId = tempId<"teams">();
  const profileId = tempId<"profiles">();
  const profiles = localStore.getQuery(api.profiles.list, {});
  const userId = profiles?.[0]?.userId ?? tempId<"users">();
  const profile = {
    _id: profileId,
    _creationTime: now,
    userId,
    name: args.name,
    color: "#8B5CF6",
    icon: "briefcase",
    isDefault: false as const,
    teamId,
    createdAt: now,
    updatedAt: now,
  };
  if (profiles !== undefined) {
    localStore.setQuery(api.profiles.list, {}, [...profiles, profile]);
  }
  const teams = localStore.getQuery(api.teams.list, {});
  if (teams === undefined) return;
  localStore.setQuery(api.teams.list, {}, [
    ...teams,
    {
      team: {
        _id: teamId,
        _creationTime: now,
        name: args.name,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      },
      role: "owner" as const,
      profile,
      memberCount: 1,
    },
  ]);
}
