import type { OptimisticLocalStore } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { api, type Id, type TableNames } from "@vmem/backend";

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

type MemoryApiRow = NonNullable<FunctionReturnType<typeof api.memoryApi.get>>;
type MemorySummaryPage = FunctionReturnType<typeof api.memoryApi.listSummaries>;
type MemorySummaryRow = MemorySummaryPage["page"][number];
type MemoryCreateArgs = FunctionArgs<typeof api.memoryApi.create>;
type MemoryUpdateArgs = FunctionArgs<typeof api.memoryApi.update>;
type SummaryListArgs = FunctionArgs<typeof api.memoryApi.listSummaries>;

// type/source/tag criteria only; list rows hold a preview, never the body
function summaryMatchesFilterArgs(
  memory: Pick<MemorySummaryRow, "type" | "source" | "tags">,
  args: SummaryListArgs,
): boolean {
  if (args.type !== undefined && args.type !== memory.type) return false;
  if (args.source !== undefined && args.source !== memory.source) return false;
  if (args.tags !== undefined && args.tags.length > 0) {
    const have = new Set(memory.tags);
    if (!args.tags.every((tag) => have.has(tag))) return false;
  }
  return true;
}

function newMemoryMatchesSearch(
  args: Pick<MemoryCreateArgs, "title" | "content" | "tags">,
  searchQuery: string | undefined,
): boolean {
  const q = searchQuery?.trim().toLowerCase();
  if (q === undefined || q.length === 0) return true;
  const haystack =
    `${args.title} ${args.content} ${args.tags.join(" ")}`.toLowerCase();
  return haystack.includes(q);
}

function optimisticSummaryRow(args: MemoryCreateArgs): MemorySummaryRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: args.title,
    preview: args.content.replace(/\s+/g, " ").trim().slice(0, 200),
    type: args.type,
    status: "active",
    source: args.source,
    sourceUrl: args.url ?? null,
    sourceSyncedAt: null,
    tags: args.tags,
    createdAt: now,
    updatedAt: now,
    profileId: args.profileId ?? null,
  };
}

// Each loaded page of a paginated list is its own cached query entry (args
// carry paginationOpts.cursor). New rows belong at the head of the first page
// (cursor === null); the server result replaces it once the mutation lands.
export function insertMemoryInLists(
  localStore: OptimisticLocalStore,
  args: MemoryCreateArgs,
): void {
  const row = optimisticSummaryRow(args);
  for (const entry of localStore.getAllQueries(api.memoryApi.listSummaries)) {
    if (entry.value === undefined) continue;
    if (entry.args.paginationOpts.cursor !== null) continue;
    if (
      args.profileId !== undefined &&
      entry.args.profileId !== undefined &&
      entry.args.profileId !== args.profileId
    ) {
      continue;
    }
    if (!summaryMatchesFilterArgs(row, entry.args)) continue;
    if (!newMemoryMatchesSearch(args, entry.args.searchQuery)) continue;
    localStore.setQuery(api.memoryApi.listSummaries, entry.args, {
      ...entry.value,
      page: [row, ...entry.value.page],
    });
  }
}

export function patchMemoryInLists(
  localStore: OptimisticLocalStore,
  args: MemoryUpdateArgs,
): void {
  const now = new Date().toISOString();
  const patchSummary = (row: MemorySummaryRow): MemorySummaryRow =>
    row.id !== args.memoryId
      ? row
      : {
          ...row,
          ...(args.title !== undefined ? { title: args.title } : {}),
          ...(args.content !== undefined
            ? {
                preview: args.content.replace(/\s+/g, " ").trim().slice(0, 200),
              }
            : {}),
          ...(args.type !== undefined ? { type: args.type } : {}),
          ...(args.status !== undefined ? { status: args.status } : {}),
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
          updatedAt: now,
        };
  const patchRow = (row: MemoryApiRow): MemoryApiRow =>
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
          updatedAt: now,
        };

  for (const entry of localStore.getAllQueries(api.memoryApi.listSummaries)) {
    if (entry.value === undefined) continue;
    if (!entry.value.page.some((row) => row.id === args.memoryId)) continue;
    // a row edited out of a filtered list (e.g. tag removed) drops out of it;
    // text search is left to the server since rows hold only a preview
    const page = entry.value.page
      .map(patchSummary)
      .filter(
        (row) =>
          row.id !== args.memoryId || summaryMatchesFilterArgs(row, entry.args),
      );
    localStore.setQuery(api.memoryApi.listSummaries, entry.args, {
      ...entry.value,
      page,
    });
  }

  for (const entry of localStore.getAllQueries(api.memoryApi.get)) {
    if (entry.value == null || entry.value.id !== args.memoryId) continue;
    localStore.setQuery(api.memoryApi.get, entry.args, patchRow(entry.value));
  }
}

export function removeMemoryFromLists(
  localStore: OptimisticLocalStore,
  memoryId: string,
): void {
  updateAllCachedQueries(localStore, api.memoryApi.listSummaries, (page) =>
    page.page.some((row) => row.id === memoryId)
      ? { ...page, page: page.page.filter((row) => row.id !== memoryId) }
      : page,
  );
  for (const entry of localStore.getAllQueries(api.memoryApi.get)) {
    if (entry.args.memoryId === memoryId) {
      localStore.setQuery(api.memoryApi.get, entry.args, null);
    }
  }
}

const TEAM_PROFILE_COLOR = "#8B5CF6";
const TEAM_PROFILE_ICON = "briefcase";

export function insertCreatedTeamInLists(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.teams.create>,
): void {
  const now = Date.now();
  const teamId = tempId<"teams">();
  const profileId = tempId<"profiles">();
  const profiles = localStore.getQuery(api.profiles.list, {});
  if (profiles !== undefined) {
    localStore.setQuery(api.profiles.list, {}, [
      ...profiles,
      {
        _id: profileId,
        _creationTime: now,
        userId: profiles[0]?.userId ?? tempId<"users">(),
        name: args.name,
        color: TEAM_PROFILE_COLOR,
        icon: TEAM_PROFILE_ICON,
        isDefault: false,
        teamId,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }
  updateAllCachedQueries(localStore, api.teams.list, (list) => [
    ...list,
    {
      team: {
        _id: teamId,
        _creationTime: now,
        name: args.name,
        createdBy: list[0]?.team.createdBy ?? tempId<"users">(),
        createdAt: now,
        updatedAt: now,
      },
      role: "owner" as const,
      profile: {
        _id: profileId,
        _creationTime: now,
        userId: list[0]?.team.createdBy ?? tempId<"users">(),
        name: args.name,
        color: TEAM_PROFILE_COLOR,
        icon: TEAM_PROFILE_ICON,
        isDefault: false,
        teamId,
        createdAt: now,
        updatedAt: now,
      },
      memberCount: 1,
    },
  ]);
}

export function insertTeamMemberOptimistic(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.teams.addMember>,
): void {
  const detail = localStore.getQuery(api.teams.get, { teamId: args.teamId });
  if (detail == null) return;
  const email = args.email.trim().toLowerCase();
  if (detail.members.some((m) => m.email === email)) return;
  const now = Date.now();
  localStore.setQuery(
    api.teams.get,
    { teamId: args.teamId },
    {
      ...detail,
      members: [
        ...detail.members,
        {
          userId: tempId<"users">(),
          role: "member",
          joinedAt: now,
          email,
          fullName: email,
          firstName: null,
          lastName: null,
        },
      ],
    },
  );
}
