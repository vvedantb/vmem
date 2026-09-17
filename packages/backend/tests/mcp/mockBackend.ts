import { getFunctionName } from "convex/server";
import type { MemoryStatus, MemoryType, MemoryWithTags } from "@vmem/sdk";
import { memoryTypeSchema } from "@vmem/sdk";
import { z } from "zod";
import type { ActionCtx } from "../../convex/_generated/server";
import type { EffectiveSkill } from "../../convex/skills";
import { memoryMatchesListFilter } from "../../engine/memory/list";

export const MOCK_CLERK_ID = "clerk_mcp_harness";
export const MOCK_USER_ID = "users_mcp_harness";
export const MOCK_PERSONAL_PROFILE_ID = "profile_personal";
export const MOCK_TEAM_PROFILE_ID = "profile_team";

const clerkIdArgsSchema = z.object({ clerkId: z.string() });
const clerkScopeArgsSchema = z.object({
  clerkId: z.string(),
  scope: z.enum(["personal", "team"]),
});
const resolveProfileArgsSchema = z.object({
  clerkId: z.string(),
  scope: z.enum(["personal", "team"]),
  profileId: z.string().optional(),
});
const setActiveProfileArgsSchema = z.object({
  clerkId: z.string(),
  scope: z.enum(["personal", "team"]),
  profileId: z.string(),
});
const listMemoriesArgsSchema = z.object({
  userId: z.string().optional(),
  profileId: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  searchQuery: z.string().optional(),
  limit: z.number(),
  offset: z.number(),
});
const createMemoryArgsSchema = z.object({
  userId: z.string(),
  profileId: z.string().optional(),
  title: z.string(),
  content: z.string(),
  type: memoryTypeSchema,
  source: z.string(),
  tags: z.array(z.string()),
  confidence: z.number(),
});
const memoryIdArgsSchema = z.object({
  userId: z.string().optional(),
  profileId: z.string().optional(),
  memoryId: z.string(),
});
const updateMemoryArgsSchema = z.object({
  userId: z.string(),
  memoryId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  type: memoryTypeSchema.optional(),
  status: z.enum(["active", "pinned", "suppressed", "expired"]).optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().optional(),
});
const searchTextArgsSchema = z.object({
  kind: z.enum(["personal", "team"]),
  userId: z.string().optional(),
  profileId: z.string().optional(),
  query: z.string(),
});
const memoryIdsArgsSchema = z.object({ ids: z.array(z.string()) });
const collectScopedArgsSchema = z.object({
  kind: z.enum(["personal", "team"]),
  userId: z.string().optional(),
  profileId: z.string().optional(),
});
const userIdArgsSchema = z.object({ userId: z.string() });
const skillNameArgsSchema = z.object({
  clerkId: z.string(),
  name: z.string(),
});
const skillCreateArgsSchema = z.object({
  clerkId: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
});
const skillUpdateArgsSchema = z.object({
  clerkId: z.string(),
  name: z.string(),
  newName: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  enabled: z.boolean().optional(),
});
const wikiIdArgsSchema = z.object({
  clerkId: z.string(),
  id: z.string(),
});
const wikiSearchArgsSchema = z.object({
  clerkId: z.string(),
  queryText: z.string(),
});
const wikiCreateArgsSchema = z.object({
  clerkId: z.string(),
  parentId: z.string().optional(),
  kind: z.enum(["folder", "document", "artifact"]),
  title: z.string(),
  content: z.string().optional(),
  contentText: z.string().optional(),
  language: z.string().optional(),
});
const wikiUpdateArgsSchema = z.object({
  clerkId: z.string(),
  id: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  contentText: z.string().optional(),
  language: z.string().optional(),
});
const fileUpsertArgsSchema = z.object({
  clerkId: z.string(),
  segments: z.array(z.string()),
  storageId: z.string(),
  mimeType: z.string(),
  size: z.number(),
});
const fileDeleteArgsSchema = z.object({
  clerkId: z.string(),
  nodeId: z.string(),
});
const storageIdArgsSchema = z.object({
  storageId: z.string(),
});

export type MockSkill = EffectiveSkill;

type MockProfile = {
  _id: string;
  _creationTime: number;
  userId: string;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
  teamId?: string;
  createdAt: number;
  updatedAt: number;
};

type MockWikiNode = {
  _id: string;
  _creationTime: number;
  userId: string;
  parentId?: string;
  kind: "folder" | "document" | "artifact";
  title: string;
  content?: string;
  contentText?: string;
  language?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};

type MockFileNode = {
  _id: string;
  _creationTime: number;
  userId: string;
  parentId?: string;
  kind: "folder" | "file";
  name: string;
  mimeType?: string;
  size?: number;
  storageId?: string;
  createdAt: number;
  updatedAt: number;
};

export type MockStore = {
  clerkId: string;
  personalProfile: MockProfile;
  teamProfile: MockProfile;
  activePersonalProfileId: string;
  activeTeamProfileId: string | null;
  memories: MemoryWithTags[];
  links: Array<{ sourceId: string; targetId: string; reason: string }>;
  skills: MockSkill[];
  wiki: MockWikiNode[];
  files: MockFileNode[];
  blobs: Map<string, Blob>;
  nextId: number;
};

function nowMs(): number {
  return Date.now();
}

function isoNow(): string {
  return new Date().toISOString();
}

function allocId(store: MockStore, prefix: string): string {
  store.nextId += 1;
  return `${prefix}_${String(store.nextId)}`;
}

function makeProfile(args: {
  id: string;
  name: string;
  isDefault: boolean;
  teamId?: string;
}): MockProfile {
  const createdAt = nowMs();
  return {
    _id: args.id,
    _creationTime: createdAt,
    userId: MOCK_USER_ID,
    name: args.name,
    color: "#3B82F6",
    icon: "briefcase",
    isDefault: args.isDefault,
    teamId: args.teamId,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createMockStore(): MockStore {
  return {
    clerkId: MOCK_CLERK_ID,
    personalProfile: makeProfile({
      id: MOCK_PERSONAL_PROFILE_ID,
      name: "Personal",
      isDefault: true,
    }),
    teamProfile: makeProfile({
      id: MOCK_TEAM_PROFILE_ID,
      name: "Team",
      isDefault: false,
      teamId: "teams_mcp",
    }),
    activePersonalProfileId: MOCK_PERSONAL_PROFILE_ID,
    activeTeamProfileId: MOCK_TEAM_PROFILE_ID,
    memories: [],
    links: [],
    skills: [],
    wiki: [],
    files: [],
    blobs: new Map(),
    nextId: 0,
  };
}

function listMemories(
  store: MockStore,
  args: z.infer<typeof listMemoriesArgsSchema>,
  kind: "personal" | "team",
): { memories: MemoryWithTags[]; total: number } {
  const profileId =
    args.profileId ??
    (kind === "team"
      ? store.activeTeamProfileId
      : store.activePersonalProfileId);
  const filtered = store.memories.filter((memory) => {
    if (kind === "team") {
      if (memory.profileId !== profileId) return false;
    } else if (
      memory.userId !== (args.userId ?? store.clerkId) ||
      (memory.profileId !== profileId && memory.profileId !== null)
    ) {
      return false;
    }
    if (!memoryMatchesListFilter(memory, args)) return false;
    return true;
  });
  const sliced = filtered.slice(args.offset, args.offset + args.limit);
  return { memories: sliced, total: filtered.length };
}

function makeMemory(
  store: MockStore,
  args: z.infer<typeof createMemoryArgsSchema>,
): MemoryWithTags {
  const createdAt = isoNow();
  return {
    id: allocId(store, "mem"),
    userId: args.userId,
    profileId: args.profileId ?? store.activePersonalProfileId,
    title: args.title,
    content: args.content,
    type: args.type,
    source: args.source,
    sourceType: args.source,
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: args.confidence,
    status: "active",
    createdAt,
    updatedAt: createdAt,
    expiresAt: null,
    tags: args.tags,
  };
}

type ConvexFnRef = Parameters<typeof getFunctionName>[0];

function wikiById(store: MockStore, id: string): MockWikiNode | null {
  return store.wiki.find((node) => node._id === id) ?? null;
}

function functionName(ref: ConvexFnRef): string {
  return getFunctionName(ref);
}

async function dispatch(
  store: MockStore,
  ref: ConvexFnRef,
  args: unknown,
): Promise<unknown> {
  const name = functionName(ref);
  switch (name) {
    case "profiles:listByClerkIdAndScopeInternal": {
      const parsed = clerkScopeArgsSchema.parse(args);
      return parsed.scope === "team"
        ? [store.teamProfile]
        : [store.personalProfile];
    }
    case "profiles:getActiveProfileForMcpScopeInternal": {
      const parsed = clerkScopeArgsSchema.parse(args);
      if (parsed.scope === "team") {
        return parsed.clerkId === store.clerkId ? store.teamProfile : null;
      }
      return parsed.clerkId === store.clerkId ? store.personalProfile : null;
    }
    case "profiles:getOrCreateDefaultByClerkIdInternal": {
      clerkIdArgsSchema.parse(args);
      return store.personalProfile;
    }
    case "profiles:getActiveProfileForMcpInternal": {
      clerkIdArgsSchema.parse(args);
      return store.personalProfile;
    }
    case "profiles:resolveProfileIdForMcpScopeInternal": {
      const parsed = resolveProfileArgsSchema.parse(args);
      if (parsed.profileId !== undefined && parsed.profileId.length > 0) {
        const known = new Set([
          store.personalProfile._id,
          store.teamProfile._id,
        ]);
        if (!known.has(parsed.profileId)) {
          throw new Error("Profile not found");
        }
        return parsed.profileId;
      }
      return parsed.scope === "team"
        ? store.teamProfile._id
        : store.personalProfile._id;
    }
    case "userSettings:setMcpDefaultProfileByClerkIdInternal": {
      const parsed = setActiveProfileArgsSchema.parse(args);
      if (parsed.scope === "team") {
        store.activeTeamProfileId = parsed.profileId;
      } else {
        store.activePersonalProfileId = parsed.profileId;
      }
      return null;
    }
    case "contextPromptApi:mcpGetContextPrompt": {
      clerkIdArgsSchema.parse(args);
      return { content: "# vmem User Profile\n\nHarness mock profile." };
    }
    case "contextPromptCache:markPendingByClerkIdInternal": {
      clerkIdArgsSchema.parse(args);
      return false;
    }
    case "dreamTrigger:bumpActivityByClerkIdInternal": {
      clerkIdArgsSchema.parse(args);
      return false;
    }
    case "memoryStore/functions:createMemoryInternal": {
      const parsed = createMemoryArgsSchema.parse(args);
      const created = makeMemory(store, parsed);
      store.memories.push(created);
      return created;
    }
    case "memoryStore/functions:listMemoriesInternal": {
      const parsed = listMemoriesArgsSchema.parse(args);
      return listMemories(store, parsed, "personal");
    }
    case "memoryStore/functions:listMemoriesForTeamInternal": {
      const parsed = listMemoriesArgsSchema.parse(args);
      return listMemories(store, parsed, "team");
    }
    case "memoryStore/functions:getMemoryInternal": {
      const parsed = memoryIdArgsSchema.parse(args);
      return (
        store.memories.find(
          (memory) =>
            memory.id === parsed.memoryId && memory.userId === parsed.userId,
        ) ?? null
      );
    }
    case "memoryStore/functions:getMemoryForTeamInternal": {
      const parsed = memoryIdArgsSchema.parse(args);
      return (
        store.memories.find(
          (memory) =>
            memory.id === parsed.memoryId &&
            memory.profileId === parsed.profileId,
        ) ?? null
      );
    }
    case "memoryStore/functions:updateMemoryInternal": {
      const parsed = updateMemoryArgsSchema.parse(args);
      const memory = store.memories.find(
        (row) => row.id === parsed.memoryId && row.userId === parsed.userId,
      );
      if (!memory) return null;
      if (parsed.title !== undefined) memory.title = parsed.title;
      if (parsed.content !== undefined) memory.content = parsed.content;
      if (parsed.type !== undefined) memory.type = parsed.type;
      if (parsed.status !== undefined) memory.status = parsed.status;
      if (parsed.tags !== undefined) memory.tags = parsed.tags;
      if (parsed.confidence !== undefined)
        memory.confidence = parsed.confidence;
      memory.updatedAt = isoNow();
      return memory;
    }
    case "memoryStore/functions:deleteMemoryInternal": {
      const parsed = memoryIdArgsSchema.parse(args);
      const index = store.memories.findIndex(
        (memory) =>
          memory.id === parsed.memoryId && memory.userId === parsed.userId,
      );
      if (index < 0) return false;
      store.memories.splice(index, 1);
      return true;
    }
    case "memoryStore/functions:searchMemoriesTextInternal": {
      const parsed = searchTextArgsSchema.parse(args);
      const query = parsed.query.toLowerCase();
      const hits = store.memories
        .filter((memory) => {
          if (parsed.kind === "team") {
            return memory.profileId === parsed.profileId;
          }
          return memory.userId === parsed.userId;
        })
        .map((memory, index) => ({ memory, index }))
        .filter(({ memory }) =>
          `${memory.title}\n${memory.content}`.toLowerCase().includes(query),
        )
        .map(({ memory, index }) => ({ memory, rank: index + 1 }));
      return hits;
    }
    case "memoryStore/functions:getMemoriesByMemoryIdsInternal": {
      const parsed = memoryIdsArgsSchema.parse(args);
      return parsed.ids.map(
        (id) => store.memories.find((memory) => memory.id === id) ?? null,
      );
    }
    case "memoryStore/functions:listMemoryLinksForUserInternal": {
      const parsed = userIdArgsSchema.parse(args);
      return store.links.filter((_link) => parsed.userId === store.clerkId);
    }
    case "memoryStore/functions:collectScopedMemoriesInternal": {
      const parsed = collectScopedArgsSchema.parse(args);
      return listMemories(
        store,
        {
          userId: parsed.userId,
          profileId: parsed.profileId,
          limit: 1000,
          offset: 0,
        },
        parsed.kind,
      ).memories;
    }
    case "skills:listEffectiveByClerkIdInternal": {
      clerkIdArgsSchema.parse(args);
      return store.skills.filter((skill) => skill.enabled);
    }
    case "skills:getEffectiveByNameInternal": {
      const parsed = skillNameArgsSchema.parse(args);
      const lookup = parsed.name.trim().toLowerCase();
      return (
        store.skills.find((skill) => skill.name.toLowerCase() === lookup) ??
        null
      );
    }
    case "skills:createByClerkIdInternal": {
      const parsed = skillCreateArgsSchema.parse(args);
      const created: MockSkill = {
        name: parsed.name,
        description: parsed.description,
        instructions: parsed.instructions,
        enabled: true,
        source: "personal",
      };
      store.skills.push(created);
      return created;
    }
    case "skills:updateByClerkIdInternal": {
      const parsed = skillUpdateArgsSchema.parse(args);
      const skill = store.skills.find((row) => row.name === parsed.name);
      if (!skill) throw new Error("Skill not found");
      if (parsed.newName !== undefined) skill.name = parsed.newName;
      if (parsed.description !== undefined)
        skill.description = parsed.description;
      if (parsed.instructions !== undefined) {
        skill.instructions = parsed.instructions;
      }
      if (parsed.enabled !== undefined) skill.enabled = parsed.enabled;
      return skill;
    }
    case "skills:deleteByClerkIdInternal": {
      const parsed = skillNameArgsSchema.parse(args);
      const index = store.skills.findIndex(
        (skill) => skill.name === parsed.name,
      );
      if (index < 0) throw new Error("Skill not found");
      store.skills.splice(index, 1);
      return null;
    }
    case "wiki:listByClerkIdInternal": {
      clerkIdArgsSchema.parse(args);
      return [...store.wiki];
    }
    case "wiki:getByIdInternal": {
      const parsed = wikiIdArgsSchema.parse(args);
      return wikiById(store, parsed.id);
    }
    case "wiki:searchByClerkIdInternal": {
      const parsed = wikiSearchArgsSchema.parse(args);
      const query = parsed.queryText.trim().toLowerCase();
      if (query.length === 0) return [];
      return store.wiki.filter((node) => {
        const body = `${node.title}\n${node.content ?? ""}`.toLowerCase();
        return body.includes(query);
      });
    }
    case "wiki:createByClerkIdInternal": {
      const parsed = wikiCreateArgsSchema.parse(args);
      const createdAt = nowMs();
      const node: MockWikiNode = {
        _id: allocId(store, "wiki"),
        _creationTime: createdAt,
        userId: MOCK_USER_ID,
        parentId: parsed.parentId,
        kind: parsed.kind,
        title: parsed.title,
        content: parsed.content,
        contentText: parsed.contentText,
        language: parsed.language,
        order: store.wiki.length,
        createdAt,
        updatedAt: createdAt,
      };
      store.wiki.push(node);
      return node._id;
    }
    case "wiki:updateByClerkIdInternal": {
      const parsed = wikiUpdateArgsSchema.parse(args);
      const node = wikiById(store, parsed.id);
      if (!node) throw new Error("Not found");
      if (parsed.title !== undefined) node.title = parsed.title;
      if (parsed.content !== undefined) node.content = parsed.content;
      if (parsed.contentText !== undefined)
        node.contentText = parsed.contentText;
      if (parsed.language !== undefined) node.language = parsed.language;
      node.updatedAt = nowMs();
      return node._id;
    }
    case "wiki:deleteByClerkIdInternal": {
      const parsed = wikiIdArgsSchema.parse(args);
      const root = wikiById(store, parsed.id);
      if (!root) throw new Error("Not found");
      const before = store.wiki.length;
      store.wiki = store.wiki.filter((node) => {
        if (node._id === root._id) return false;
        return node.parentId !== root._id;
      });
      return before - store.wiki.length;
    }
    case "files:listByClerkIdInternal": {
      clerkIdArgsSchema.parse(args);
      return [...store.files];
    }
    case "files:upsertFileByPathInternal": {
      const parsed = fileUpsertArgsSchema.parse(args);
      let parentId: string | undefined;
      const createdAt = nowMs();
      for (const name of parsed.segments.slice(0, -1)) {
        const existing = store.files.find(
          (node) => node.parentId === parentId && node.name === name,
        );
        if (existing) {
          if (existing.kind !== "folder") {
            throw new Error(`Path segment "${name}" is a file, not a folder`);
          }
          parentId = existing._id;
          continue;
        }
        const folder: MockFileNode = {
          _id: allocId(store, "file"),
          _creationTime: createdAt,
          userId: MOCK_USER_ID,
          parentId,
          kind: "folder",
          name,
          createdAt,
          updatedAt: createdAt,
        };
        store.files.push(folder);
        parentId = folder._id;
      }
      const fileName = parsed.segments[parsed.segments.length - 1];
      if (fileName === undefined) throw new Error("Path is required");
      const existingFile = store.files.find(
        (node) => node.parentId === parentId && node.name === fileName,
      );
      if (existingFile) {
        existingFile.kind = "file";
        existingFile.mimeType = parsed.mimeType;
        existingFile.size = parsed.size;
        existingFile.storageId = parsed.storageId;
        existingFile.updatedAt = createdAt;
        return { nodeId: existingFile._id };
      }
      const file: MockFileNode = {
        _id: allocId(store, "file"),
        _creationTime: createdAt,
        userId: MOCK_USER_ID,
        parentId,
        kind: "file",
        name: fileName,
        mimeType: parsed.mimeType,
        size: parsed.size,
        storageId: parsed.storageId,
        createdAt,
        updatedAt: createdAt,
      };
      store.files.push(file);
      return { nodeId: file._id };
    }
    case "files:deleteStorageInternal": {
      const parsed = storageIdArgsSchema.parse(args);
      store.blobs.delete(parsed.storageId);
      return null;
    }
    case "files:deleteByIdForClerkInternal": {
      const parsed = fileDeleteArgsSchema.parse(args);
      const before = store.files.length;
      store.files = store.files.filter((node) => node._id !== parsed.nodeId);
      return { deletedCount: before - store.files.length };
    }
    case "users:getByClerkIdInternal": {
      clerkIdArgsSchema.parse(args);
      return null;
    }
    case "userEnvVars:getAllInternal": {
      return [];
    }
    default:
      throw new Error(`unmocked Convex function: ${name}`);
  }
}

export function createMockActionCtx(store: MockStore): ActionCtx {
  const ctx = {
    runQuery: async (ref: ConvexFnRef, args: unknown) =>
      dispatch(store, ref, args),
    runMutation: async (ref: ConvexFnRef, args: unknown) =>
      dispatch(store, ref, args),
    runAction: async (ref: ConvexFnRef, args: unknown) =>
      dispatch(store, ref, args),
    scheduler: {
      runAfter: async () => "sched_1",
      runAt: async () => "sched_1",
    },
    storage: {
      store: async (blob: Blob) => {
        const id = allocId(store, "blob");
        store.blobs.set(id, blob);
        return id;
      },
      get: async (id: string) => store.blobs.get(id) ?? null,
      getUrl: async (id: string) =>
        store.blobs.has(id) ? `https://files.test/${id}` : null,
      delete: async (id: string) => {
        store.blobs.delete(id);
      },
    },
    vectorSearch: async () => [],
    auth: {
      getUserIdentity: async () => null,
    },
  };
  return requireActionCtx(ctx);
}

function requireActionCtx(value: unknown): ActionCtx {
  if (typeof value !== "object" || value === null) {
    throw new Error("mock ActionCtx must be an object");
  }
  if (!isActionCtx(value)) {
    throw new Error("mock ActionCtx is incomplete");
  }
  return value;
}

function isActionCtx(value: object): value is ActionCtx {
  return "runQuery" in value && "runMutation" in value && "runAction" in value;
}

export function seedMemory(
  store: MockStore,
  args: {
    title: string;
    content: string;
    tags?: string[];
    type?: MemoryType;
    source?: string;
    status?: MemoryStatus;
    profileId?: string;
  },
): MemoryWithTags {
  const created = makeMemory(store, {
    userId: store.clerkId,
    profileId: args.profileId ?? store.activePersonalProfileId,
    title: args.title,
    content: args.content,
    type: args.type ?? "knowledge",
    source: args.source ?? "mcp",
    tags: args.tags ?? [],
    confidence: 1,
  });
  if (args.status !== undefined) {
    created.status = args.status;
  }
  store.memories.push(created);
  return created;
}
