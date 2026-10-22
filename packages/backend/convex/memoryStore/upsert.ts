import type { MemoryWithTags } from "@vmem/sdk";
import {
  browseGateParts,
  browseUrlOf,
  isBrowseSource,
  isLowValueBrowseUrl,
  isSearchRefinement,
  searchPageOf,
  type BrowseGateParts,
} from "../../engine/memory/browseGate";
import { normalizeTags } from "../../engine/memory/tags";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  createMemory,
  findSourceMatch,
  isLiveDoc,
  upsertMemoryFromSource,
  type CreateMemoryStoreParams,
} from "./helpers";
import { toMemoryWithTags } from "./mappers";

type CreateOrUpsertFields = Omit<CreateMemoryStoreParams, "sourceId">;

export type CreateOrUpsertResult = {
  memory: MemoryWithTags;
  needsFollowUp: boolean;
};

// fallback for rows stored without sourceId, and the search refinement window
const RECENT_BROWSE_WINDOW_MS = 24 * 60 * 60 * 1000;
const SEARCH_REFINE_WINDOW_MS = 5 * 60 * 1000;
const RECENT_BROWSE_SCAN_MAX = 200;

/**
 * Caller-facing create (web, MCP, HTTP, SDK). A non-empty externalId upserts
 * one live row per (user, profile, sourceType, externalId); without it an
 * exact-hash repeat comes back `deduped`. `needsFollowUp` is false for a
 * visit-only repeat and for a dedupe, so callers skip embed and enrichment.
 * Browsing-history writes go through the browse gate first.
 */
export async function createOrUpsertMemory(
  ctx: MutationCtx,
  params: CreateOrUpsertFields & { externalId?: string },
): Promise<CreateOrUpsertResult> {
  const { externalId, ...fields } = params;
  const sourceId = externalId?.trim() || undefined;
  if (isBrowseSource(fields)) {
    const url = browseUrlOf(fields);
    if (url) return createOrUpsertBrowse(ctx, fields, url, sourceId);
  }
  if (sourceId) return upsertByKey(ctx, fields, sourceId);
  const memory = await createMemory(ctx, fields);
  return { memory, needsFollowUp: memory.deduped !== true };
}

async function upsertByKey(
  ctx: MutationCtx,
  fields: CreateOrUpsertFields,
  sourceId: string,
): Promise<CreateOrUpsertResult> {
  const { memory, contentChanged } = await upsertMemoryFromSource(ctx, {
    ...fields,
    sourceType: fields.sourceType ?? fields.source,
    sourceId,
    visibleOnly: true,
  });
  return { memory, needsFollowUp: contentChanged };
}

/**
 * Browse gate, no AI: skip low-value pages; key old extension writes (no
 * externalId) on the server and store stable content; then upsert on the
 * key, else fold into a recent row with the same key or canonical url, or
 * into a search on the same engine that this query refines.
 */
async function createOrUpsertBrowse(
  ctx: MutationCtx,
  fields: CreateOrUpsertFields,
  url: string,
  externalId: string | undefined,
): Promise<CreateOrUpsertResult> {
  const gate = browseGateParts({ url, title: fields.title });
  const key = externalId ?? gate.key;
  const scope = {
    userId: fields.userId,
    profileId: fields.profileId,
    sourceType: fields.sourceType ?? fields.source,
  };

  if (isLowValueBrowseUrl(url)) {
    const existing = await findSourceMatch(
      ctx,
      { ...scope, sourceId: key },
      true,
    );
    return {
      memory: existing
        ? { ...toMemoryWithTags(existing), skipped: true }
        : skippedMemory(fields),
      needsFollowUp: false,
    };
  }

  const stable =
    externalId === undefined
      ? { ...fields, url, title: gate.title, content: gate.content }
      : fields;
  if (await findSourceMatch(ctx, { ...scope, sourceId: key }, true)) {
    return upsertByKey(ctx, stable, key);
  }

  const recent = await findRecentBrowseMatch(ctx, scope, gate, url);
  if (recent === null) return upsertByKey(ctx, stable, key);
  // a keyless row adopts the key; a refined search moves to the new key
  if (recent.doc.sourceId === undefined || recent.kind === "refine") {
    await ctx.db.patch(recent.doc._id, { sourceId: key });
    return upsertByKey(ctx, stable, key);
  }
  // same page under another key (e.g. a v1 generic-title key): visits only
  await ctx.db.patch(recent.doc._id, {
    visitCount: recent.doc.visitCount + 1,
    lastVisitAt: Date.now(),
    url,
  });
  const bumped = await ctx.db.get(recent.doc._id);
  if (!bumped) throw new Error("Failed to bump browse memory");
  return {
    memory: { ...toMemoryWithTags(bumped), deduped: true },
    needsFollowUp: false,
  };
}

/**
 * Newest live row of this source in the user + profile, visited in the last
 * 24h, that is the same page (key or canonical url), else a search on the
 * same engine in the last 5 minutes that the new query repeats or refines.
 * Reads at most RECENT_BROWSE_SCAN_MAX rows.
 */
async function findRecentBrowseMatch(
  ctx: MutationCtx,
  scope: { userId: string; profileId?: string; sourceType: string },
  gate: BrowseGateParts,
  url: string,
): Promise<{ kind: "same" | "refine"; doc: Doc<"memories"> } | null> {
  const now = Date.now();
  const rows = await ctx.db
    .query("memories")
    .withIndex("by_user_profile_source_visit", (q) =>
      q
        .eq("userId", scope.userId)
        .eq("profileId", scope.profileId)
        .eq("sourceType", scope.sourceType)
        .gte("lastVisitAt", now - RECENT_BROWSE_WINDOW_MS),
    )
    .order("desc")
    .take(RECENT_BROWSE_SCAN_MAX);
  const search = searchPageOf(url);
  let refine: Doc<"memories"> | null = null;
  for (const doc of rows) {
    if (!isLiveDoc(doc, now)) continue;
    const docUrl = browseUrlOf(doc);
    if (!docUrl) continue;
    const docGate = browseGateParts({ url: docUrl, title: doc.title });
    if (
      docGate.key === gate.key ||
      docGate.canonicalUrl === gate.canonicalUrl
    ) {
      return { kind: "same", doc };
    }
    if (
      refine === null &&
      search !== null &&
      doc.lastVisitAt >= now - SEARCH_REFINE_WINDOW_MS
    ) {
      const prev = searchPageOf(docUrl);
      if (prev && isSearchRefinement(prev, search)) refine = doc;
    }
  }
  return refine === null ? null : { kind: "refine", doc: refine };
}

// nothing stored, so no id; callers only count it
function skippedMemory(fields: CreateOrUpsertFields): MemoryWithTags {
  const now = new Date().toISOString();
  return {
    id: "",
    userId: fields.userId,
    profileId: fields.profileId ?? null,
    title: fields.title,
    content: fields.content,
    type: fields.type,
    source: fields.source,
    sourceType: fields.sourceType ?? null,
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: fields.confidence,
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
    tags: normalizeTags(fields.tags),
    skipped: true,
  };
}
