import { z } from "zod";
import type { MemoryType } from "@vmem/sdk";
import { internal } from "../_generated/api";
import { memoryStatsForScope } from "../dashboardApi";
import { memoryTimeline, topicTimeline } from "../memoryApi/timelineEvents";
import type { MemorySummary } from "../memoryStore/mappers";
import {
  listMemorySummariesPaged,
  MAX_SCOPE_SUMMARIES,
} from "../memoryStore/walk";
import {
  listMemoriesForClerk,
  listMemoriesForTeamProfile,
} from "../memoryRuntime";
import { consolidateProfileTags } from "../tagConsolidate";
import { readUploadBlob } from "./fileOps";
import {
  loadMemoryForMcpScope,
  memoryReadScopeForMcp,
  runForMcpScope,
  updateMemoryInMcpScope,
  withMcpMemoryScope,
  type McpResolvedScope,
} from "./memoryScope";
import {
  requireUserId,
  scopedMemory,
  toolSpec,
  type ToolHandlerContext,
} from "./toolTypes";

const profileIdParam = z
  .string()
  .optional()
  .describe("Profile ID (defaults to the active MCP profile)");

const tagSortSchema = z.enum(["a-z", "most-used", "most-recent"]);
type TagSort = z.infer<typeof tagSortSchema>;

const LINK_REASON_MAX = 200;

const memoryFacetsSchema = z.object({
  profileId: profileIdParam,
  tagSort: tagSortSchema
    .optional()
    .describe("Tag order: a-z (default), most-used, or most-recent"),
});

const memoryTagRenameSchema = z.object({
  tag: z
    .string()
    .min(1)
    .describe("Existing tag, exactly as memory_facets lists it"),
  newTag: z
    .string()
    .trim()
    .min(1)
    .describe("New tag name (trimmed and lowercased, like the web app)"),
  profileId: profileIdParam,
});

const memoryTagDeleteSchema = z.object({
  tag: z
    .string()
    .min(1)
    .describe("Tag to remove, exactly as memory_facets lists it"),
  confirm: z
    .literal(true)
    .describe("Must be true: removes the tag from every memory in the profile"),
  profileId: profileIdParam,
});

const memoryTagsConsolidateSchema = z.object({ profileId: profileIdParam });

const memoryLinkSchema = z.object({
  memoryIdA: z.string().describe("First memory ID"),
  memoryIdB: z.string().describe("Second memory ID"),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(LINK_REASON_MAX)
    .optional()
    .describe('Why they are related (default "agent linked")'),
  profileId: profileIdParam,
});

const memoryUnlinkSchema = z.object({
  memoryIdA: z.string().describe("First memory ID"),
  memoryIdB: z.string().describe("Second memory ID"),
  profileId: profileIdParam,
});

const memoryHistorySchema = z.object({
  memoryId: z.string().describe("Memory ID"),
  profileId: profileIdParam,
});

const memoryTopicTimelineSchema = z.object({
  tag: z.string().min(1).describe("Tag to follow"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Max events (default 50, max 500)"),
  offset: z.number().int().min(0).optional().describe("Offset (default 0)"),
  profileId: profileIdParam,
});

const memoryStatsSchema = z.object({ profileId: profileIdParam });

const memoryImportFileSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .describe("File name with extension, e.g. notes.md or report.pdf"),
  contentBase64: z
    .string()
    .optional()
    .describe("File bytes as base64 (a data: URL prefix is accepted)"),
  sourceUrl: z
    .string()
    .url()
    .optional()
    .describe("Public URL to fetch the file from instead of contentBase64"),
  mimeType: z
    .string()
    .optional()
    .describe("MIME type (default: from the data URL, response or filename)"),
  profileId: profileIdParam,
});

function inScope<T>(
  h: ToolHandlerContext,
  profileId: string | undefined,
  run: (scope: McpResolvedScope) => Promise<T>,
): Promise<T> {
  return withMcpMemoryScope(h.ctx, { ...scopedMemory(h), profileId }, run);
}

type TagFacet = { tag: string; count: number; lastUsedAt: string };

// same counts and orders as the web Tags page (buildTagStats + sortTagStats)
function buildTagFacets(rows: readonly MemorySummary[], sort: TagSort) {
  const tags = new Map<string, TagFacet>();
  const sources = new Map<string, number>();
  const types = new Map<MemoryType, number>();
  for (const row of rows) {
    sources.set(row.source, (sources.get(row.source) ?? 0) + 1);
    types.set(row.type, (types.get(row.type) ?? 0) + 1);
    for (const tag of row.tags) {
      const existing = tags.get(tag);
      if (!existing) {
        tags.set(tag, { tag, count: 1, lastUsedAt: row.createdAt });
        continue;
      }
      existing.count += 1;
      if (row.createdAt > existing.lastUsedAt) {
        existing.lastUsedAt = row.createdAt;
      }
    }
  }
  const byName = (a: TagFacet, b: TagFacet) => a.tag.localeCompare(b.tag);
  const tagList = [...tags.values()].sort((a, b) => {
    if (sort === "most-used" && a.count !== b.count) return b.count - a.count;
    if (sort === "most-recent" && a.lastUsedAt !== b.lastUsedAt) {
      return a.lastUsedAt < b.lastUsedAt ? 1 : -1;
    }
    return byName(a, b);
  });
  return {
    tags: tagList,
    sources: [...sources.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    types: [...types.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// every visible memory in scope that carries exactly `tag` (as the web Tags
// page matches it)
async function memoriesWithTag(
  h: ToolHandlerContext,
  scope: McpResolvedScope,
  tag: string,
  max: number = MAX_SCOPE_SUMMARIES,
): Promise<{ rows: MemorySummary[]; truncated: boolean }> {
  const { rows, truncated } = await listMemorySummariesPaged(
    h.ctx,
    memoryReadScopeForMcp(scope),
    { tags: [tag] },
    max,
  );
  return { rows: rows.filter((row) => row.tags.includes(tag)), truncated };
}

async function retagMemories(
  h: ToolHandlerContext,
  scope: McpResolvedScope,
  rows: readonly MemorySummary[],
  retag: (tags: readonly string[]) => string[],
): Promise<number> {
  let updated = 0;
  for (const row of rows) {
    const result = await updateMemoryInMcpScope(h.ctx, scope, row.id, {
      tags: retag(row.tags),
    });
    if (result !== null) updated += 1;
  }
  return updated;
}

async function loadMemoryPair(
  h: ToolHandlerContext,
  scope: McpResolvedScope,
  memoryIdA: string,
  memoryIdB: string,
): Promise<void> {
  if (memoryIdA === memoryIdB) {
    throw new Error("memoryIdA and memoryIdB must differ");
  }
  await loadMemoryForMcpScope(h.ctx, { ...scope, memoryId: memoryIdA });
  await loadMemoryForMcpScope(h.ctx, { ...scope, memoryId: memoryIdB });
}

// team links are checked against the shared profile, personal ones against
// the caller (see linkMemories / unlinkMemories)
function linkProfileId(scope: McpResolvedScope): string | undefined {
  return scope.mcpScope === "team" ? scope.profileId : undefined;
}

export const memoryManageToolSpecs = {
  memory_facets: toolSpec({
    name: "memory_facets",
    schema: memoryFacetsSchema,
    description:
      "Tag, source and type counts for every visible memory in a profile (the web Tags page and filter facets). Each tag has count and lastUsedAt. Reads up to 10,000 memories; truncated is true when there are more.",
    errorLabel: "Memory facets failed",
    async run(h, params): Promise<unknown> {
      return inScope(h, params.profileId, async (scope) => {
        const { rows, truncated } = await listMemorySummariesPaged(
          h.ctx,
          memoryReadScopeForMcp(scope),
          {},
          MAX_SCOPE_SUMMARIES,
        );
        return {
          profileId: scope.profileId,
          totalMemories: rows.length,
          truncated,
          ...buildTagFacets(rows, params.tagSort ?? "a-z"),
        };
      });
    },
  }),
  memory_tag_rename: toolSpec({
    name: "memory_tag_rename",
    schema: memoryTagRenameSchema,
    description:
      "Rename a tag on every memory in the profile that carries it, like Rename on the web Tags page. newTag is trimmed and lowercased. Fails if newTag already exists (rename does not merge). Returns how many memories changed.",
    errorLabel: "Rename tag failed",
    async run(h, params): Promise<unknown> {
      const newTag = params.newTag.toLowerCase();
      return inScope(h, params.profileId, async (scope) => {
        if (newTag === params.tag) {
          return { tag: params.tag, newTag, updated: 0, truncated: false };
        }
        const clash = await memoriesWithTag(h, scope, newTag, 20);
        if (clash.rows.length > 0) {
          throw new Error(`Tag "${newTag}" already exists`);
        }
        const { rows, truncated } = await memoriesWithTag(h, scope, params.tag);
        const updated = await retagMemories(h, scope, rows, (tags) => [
          ...new Set(tags.map((tag) => (tag === params.tag ? newTag : tag))),
        ]);
        return { tag: params.tag, newTag, updated, truncated };
      });
    },
  }),
  memory_tag_delete: toolSpec({
    name: "memory_tag_delete",
    schema: memoryTagDeleteSchema,
    description:
      "Remove a tag from every memory in the profile, like Delete on the web Tags page. The memories stay; only the tag is removed. Requires confirm: true. Returns how many memories changed.",
    errorLabel: "Delete tag failed",
    async run(h, params): Promise<unknown> {
      return inScope(h, params.profileId, async (scope) => {
        const { rows, truncated } = await memoriesWithTag(h, scope, params.tag);
        const updated = await retagMemories(h, scope, rows, (tags) =>
          tags.filter((tag) => tag !== params.tag),
        );
        return { tag: params.tag, updated, truncated };
      });
    },
  }),
  memory_tags_consolidate: toolSpec({
    name: "memory_tags_consolidate",
    schema: memoryTagsConsolidateSchema,
    description:
      "Merge duplicate tags in a profile. Host-name spellings merge into one brand tag, e.g. wwwyoutubecom and youtubecom into youtube. Then, when Dream Mode AI is on and a key and budget are available, Jev judges a few look-alike tags (at most 5 calls) and merges those it rates the same tag. Same merge as Dream Mode and the Dreaming page cleanup. Safe to repeat: a second run merges nothing. Returns groupsMerged, aiGroupsMerged, aiCalls, tagsRemoved, memoriesRetagged, scannedRows, truncated and the merges (keeper and losers).",
    errorLabel: "Consolidate tags failed",
    async run(h, params): Promise<unknown> {
      const userId = await requireUserId(h);
      return inScope(h, params.profileId, (scope) =>
        consolidateProfileTags(h.ctx, { profileId: scope.profileId, userId }),
      );
    },
  }),
  memory_link: toolSpec({
    name: "memory_link",
    schema: memoryLinkSchema,
    description:
      "Link two memories in the same profile (a RELATES_TO edge, shown in the Connections tab and the graph). Linking an already linked pair is a no-op that returns linked: true.",
    errorLabel: "Link memories failed",
    async run(h, params): Promise<unknown> {
      return inScope(h, params.profileId, async (scope) => {
        await loadMemoryPair(h, scope, params.memoryIdA, params.memoryIdB);
        const linked = await h.ctx.runMutation(
          internal.memoryStore.functions.linkMemoriesInternal,
          {
            userId: scope.clerkId,
            profileId: linkProfileId(scope),
            memoryIdA: params.memoryIdA,
            memoryIdB: params.memoryIdB,
            reason: params.reason ?? "agent linked",
          },
        );
        return { linked };
      });
    },
  }),
  memory_unlink: toolSpec({
    name: "memory_unlink",
    schema: memoryUnlinkSchema,
    description:
      "Remove the link between two memories. Returns unlinked: false when no link existed (or, on personal scope, when someone else made it).",
    errorLabel: "Unlink memories failed",
    async run(h, params): Promise<unknown> {
      return inScope(h, params.profileId, async (scope) => {
        await loadMemoryPair(h, scope, params.memoryIdA, params.memoryIdB);
        const unlinked = await h.ctx.runMutation(
          internal.memoryStore.functions.unlinkMemoriesInternal,
          {
            userId: scope.clerkId,
            profileId: linkProfileId(scope),
            memoryIdA: params.memoryIdA,
            memoryIdB: params.memoryIdB,
          },
        );
        return { unlinked };
      });
    },
  }),
  memory_history: toolSpec({
    name: "memory_history",
    schema: memoryHistorySchema,
    description:
      "Version history of one memory, as in the web History tab. events: timeline events with action (created or updated), a snapshot of title, content, type, status, confidence and tags, and the event time. priorVersions: the older memories a newer fact replaced (an update or a resolved contradiction), newest first, at most 20, each with id, title, a 500-char content snippet, createdAt and supersededAt. Prior versions are hidden from search, retrieve and context tools.",
    errorLabel: "Memory history failed",
    async run(h, params): Promise<unknown> {
      return inScope(h, params.profileId, async (scope) => {
        const memory = await loadMemoryForMcpScope(h.ctx, {
          ...scope,
          memoryId: params.memoryId,
        });
        const priorVersions = await h.ctx.runQuery(
          internal.memoryStore.functions.getMemoryHistoryInternal,
          {
            kind: scope.mcpScope,
            userId: scope.clerkId,
            profileId: scope.profileId,
            memoryId: memory.id,
          },
        );
        return {
          events: memoryTimeline(memory),
          priorVersions: priorVersions ?? [],
        };
      });
    },
  }),
  memory_topic_timeline: toolSpec({
    name: "memory_topic_timeline",
    schema: memoryTopicTimelineSchema,
    description:
      "Tag trail: an ordered timeline (newest first) of the memories that carry one tag, as in the web tag trail. Page with limit and offset.",
    errorLabel: "Topic timeline failed",
    async run(h, params): Promise<unknown> {
      return inScope(h, params.profileId, (scope) =>
        topicTimeline(
          (page) =>
            runForMcpScope(scope, {
              team: (profileId) =>
                listMemoriesForTeamProfile(h.ctx, { profileId, ...page }),
              personal: ({ clerkId, profileId }) =>
                listMemoriesForClerk(h.ctx, { clerkId, profileId, ...page }),
            }),
          {
            tag: params.tag,
            limit: params.limit ?? 50,
            offset: params.offset ?? 0,
          },
        ),
      );
    },
  }),
  memory_stats: toolSpec({
    name: "memory_stats",
    schema: memoryStatsSchema,
    description:
      "Dashboard stats for a profile: total memories, added today, this week and this month, tag count, and 7-day growth (isoDate, total, new).",
    errorLabel: "Memory stats failed",
    async run(h, params): Promise<unknown> {
      return inScope(h, params.profileId, (scope) =>
        memoryStatsForScope(h.ctx, memoryReadScopeForMcp(scope)),
      );
    },
  }),
  memory_import_file: toolSpec({
    name: "memory_import_file",
    schema: memoryImportFileSchema,
    description:
      "Create one memory from a PDF or text-like file (.pdf, .txt, .md, json, xml), like the web Add memory upload. The text is extracted and stored as a knowledge memory tagged pdf or text plus upload. Pass exactly one of contentBase64 or sourceUrl; max 10 MB over MCP. Adds to the active profile unless profileId is specified.",
    errorLabel: "Import file failed",
    async run(h, params): Promise<unknown> {
      return inScope(h, params.profileId, async (scope) => {
        const { blob, mimeType } = await readUploadBlob(params);
        const storageId = await h.ctx.storage.store(blob);
        try {
          return await h.ctx.runAction(
            internal.fileImport.importStoredFileForMcp,
            {
              clerkId: scope.clerkId,
              profileId: scope.profileId,
              storageId,
              filename: params.filename,
              mimeType,
            },
          );
        } catch (err) {
          await h.ctx.storage.delete(storageId);
          throw err;
        }
      });
    },
  }),
};
