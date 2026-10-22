import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { getUserByClerkId } from "../auth";
import {
  artifactFormatValidator,
  artifactRefKindValidator,
  artifactStateSpecValidator,
  artifactTypeValidator,
} from "../validators";
import {
  PURGE_ARTIFACTS_BATCH,
  checkImport,
  deleteArtifactTree,
  findByOrigin,
  insertImportedArtifact,
  listArtifactRefs,
  listVersions,
  purgeDeletedArtifactsBatch,
} from "./store";

// trash purge on its own; the hourly mcpTraces.purgeExpired sweep runs the
// same batch step. Reschedules itself while work is left.
export const purgeDeletedInternal = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const more = await purgeDeletedArtifactsBatch(ctx, Date.now());
    if (more) {
      await ctx.scheduler.runAfter(
        0,
        internal.artifacts.internal.purgeDeletedInternal,
        {},
      );
    }
    return more;
  },
});

// ---- vibot migration (admin CLI only) ----
// One user at a time, keyed by Clerk user id. Never creates vmem users:
//   npx convex run artifacts/internal:importBatchInternal \
//     '{"clerkId":"user_x","dryRun":true,"rows":[...]}'
// then verifyImportInternal to compare hashes with the source export.
// Rollback: listSinceInternal copies new rows back, removeImportedInternal
// hard-deletes the imported rows.

export const IMPORT_BATCH_MAX = 50;
// verify reads one body row per artifact (≤ 400 KB each)
const VERIFY_PAGE_SIZE = 50;
// listSince returns bodies
const LIST_SINCE_PAGE_SIZE = 10;
const REMOVE_DRY_RUN_MAX = 200;

const importVersionValidator = v.object({
  version: v.number(),
  title: v.string(),
  body: v.string(),
  stateSpec: v.optional(artifactStateSpecValidator),
  createdAt: v.number(),
});

const importRowValidator = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  type: artifactTypeValidator,
  format: artifactFormatValidator,
  language: v.optional(v.string()),
  schemaVersion: v.number(),
  stateSpec: v.optional(artifactStateSpecValidator),
  body: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  origin: v.object({ client: v.string(), externalId: v.string() }),
  refs: v.array(
    v.object({ kind: artifactRefKindValidator, target: v.string() }),
  ),
  versions: v.optional(v.array(importVersionValidator)),
  state: v.optional(
    v.object({
      data: v.record(v.string(), v.string()),
      updatedAt: v.number(),
    }),
  ),
});

type ImportRowStatus = "created" | "would_create" | "exists" | "invalid";

interface ImportRowReport {
  externalId: string;
  status: ImportRowStatus;
  id?: Id<"artifacts">;
  error?: string;
}

const cursorValidator = v.optional(v.union(v.string(), v.null()));

async function findUserId(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
): Promise<Id<"users"> | null> {
  const user = await getUserByClerkId(ctx, clerkId.trim());
  return user?._id ?? null;
}

async function requireUserId(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
): Promise<Id<"users">> {
  const userId = await findUserId(ctx, clerkId);
  if (!userId) throw new Error(`No vmem user for clerkId ${clerkId}`);
  return userId;
}

// Idempotent by (userId, origin.client, origin.externalId): existing rows are
// skipped. Keeps createdAt/updatedAt. A dry run writes nothing. created,
// byType and totalBytes cover the rows that are (or would be) created.
export const importBatchInternal = internalMutation({
  args: {
    clerkId: v.string(),
    dryRun: v.boolean(),
    rows: v.array(importRowValidator),
  },
  returns: v.object({
    dryRun: v.boolean(),
    created: v.number(),
    skipped: v.number(),
    invalid: v.number(),
    byType: v.record(v.string(), v.number()),
    totalBytes: v.number(),
    conflicts: v.array(v.string()),
    rows: v.array(
      v.object({
        externalId: v.string(),
        status: v.union(
          v.literal("created"),
          v.literal("would_create"),
          v.literal("exists"),
          v.literal("invalid"),
        ),
        id: v.optional(v.id("artifacts")),
        error: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    if (args.rows.length > IMPORT_BATCH_MAX) {
      throw new Error(
        `importBatchInternal accepts at most ${String(IMPORT_BATCH_MAX)} rows`,
      );
    }
    const byType: Record<string, number> = {};
    const conflicts: string[] = [];
    const reports: ImportRowReport[] = [];
    let totalBytes = 0;
    const summary = () => ({
      dryRun: args.dryRun,
      created: reports.filter(
        (r) => r.status === "created" || r.status === "would_create",
      ).length,
      skipped: reports.filter((r) => r.status === "exists").length,
      invalid: reports.filter((r) => r.status === "invalid").length,
      byType,
      totalBytes,
      conflicts,
      rows: reports,
    });

    const userId = await findUserId(ctx, args.clerkId);
    if (!userId) {
      conflicts.push(`No vmem user for clerkId ${args.clerkId}; skipped`);
      return summary();
    }

    // a real run sees its own writes, a dry run does not; reject repeats so
    // both report the same thing
    const seen = new Set<string>();
    for (const row of args.rows) {
      const { client, externalId } = row.origin;
      const key = `${client.trim()}\u0000${externalId.trim()}`;
      if (seen.has(key)) {
        reports.push({
          externalId,
          status: "invalid",
          error: "Duplicate origin in batch",
        });
        continue;
      }
      seen.add(key);
      const checked = checkImport(row);
      if (!checked.ok) {
        reports.push({ externalId, status: "invalid", error: checked.error });
        continue;
      }
      const { origin } = checked.value;
      const existing = await findByOrigin(
        ctx,
        userId,
        origin.client,
        origin.externalId,
      );
      if (existing) {
        reports.push({ externalId, status: "exists", id: existing._id });
        continue;
      }
      byType[row.type] = (byType[row.type] ?? 0) + 1;
      totalBytes += checked.value.bytes;
      if (args.dryRun) {
        reports.push({ externalId, status: "would_create" });
        continue;
      }
      const id = await insertImportedArtifact(ctx, userId, checked.value);
      reports.push({ externalId, status: "created", id });
    }
    return summary();
  },
});

// One page of the user's artifacts imported from `client` (rows with an
// externalId), with the sha256 of the current body for the source compare.
export const verifyImportInternal = internalQuery({
  args: {
    clerkId: v.string(),
    client: v.string(),
    cursor: cursorValidator,
  },
  returns: v.object({
    count: v.number(),
    items: v.array(
      v.object({
        externalId: v.string(),
        sha256: v.string(),
        versions: v.number(),
        hasState: v.boolean(),
      }),
    ),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx, args.clerkId);
    const page = await ctx.db
      .query("artifacts")
      .withIndex("by_user_origin", (q) =>
        q
          .eq("userId", userId)
          .eq("origin.client", args.client)
          .gte("origin.externalId", ""),
      )
      .paginate({ numItems: VERIFY_PAGE_SIZE, cursor: args.cursor ?? null });
    const items = [];
    for (const doc of page.page) {
      const externalId = doc.origin.externalId;
      if (externalId === undefined) continue;
      const body = await ctx.db.get(doc.currentBodyId);
      if (!body) throw new Error(`Artifact body missing for ${externalId}`);
      const versions = await listVersions(ctx, doc._id);
      const state = await ctx.db
        .query("artifactState")
        .withIndex("by_artifact_user", (q) => q.eq("artifactId", doc._id))
        .first();
      items.push({
        externalId,
        sha256: body.sha256,
        versions: versions.length,
        hasState: state !== null,
      });
    }
    return {
      count: items.length,
      items,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// Rollback copy: one page of the user's `client` artifacts updated after
// `since` (creation counts as an update), with bodies, refs and the owner's
// state. Includes trashed rows (deletedAt set).
export const listSinceInternal = internalQuery({
  args: {
    clerkId: v.string(),
    client: v.string(),
    since: v.number(),
    cursor: cursorValidator,
  },
  returns: v.object({
    items: v.array(
      v.object({
        id: v.id("artifacts"),
        externalId: v.optional(v.string()),
        title: v.string(),
        description: v.optional(v.string()),
        type: artifactTypeValidator,
        format: artifactFormatValidator,
        language: v.optional(v.string()),
        schemaVersion: v.number(),
        stateSpec: v.optional(artifactStateSpecValidator),
        currentVersion: v.number(),
        body: v.string(),
        refs: v.array(
          v.object({ kind: artifactRefKindValidator, target: v.string() }),
        ),
        state: v.optional(
          v.object({
            data: v.record(v.string(), v.string()),
            updatedAt: v.number(),
          }),
        ),
        createdAt: v.number(),
        updatedAt: v.number(),
        deletedAt: v.optional(v.number()),
      }),
    ),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx, args.clerkId);
    const page = await ctx.db
      .query("artifacts")
      .withIndex("by_user_updated", (q) =>
        q.eq("userId", userId).gt("updatedAt", args.since),
      )
      .filter((q) => q.eq(q.field("origin.client"), args.client))
      .paginate({
        numItems: LIST_SINCE_PAGE_SIZE,
        cursor: args.cursor ?? null,
      });
    const items = [];
    for (const doc of page.page) {
      const body = await ctx.db.get(doc.currentBodyId);
      if (!body) throw new Error(`Artifact body missing for ${doc._id}`);
      const refs = await listArtifactRefs(ctx, doc._id);
      const state = await ctx.db
        .query("artifactState")
        .withIndex("by_artifact_user", (q) =>
          q.eq("artifactId", doc._id).eq("userId", userId),
        )
        .first();
      items.push({
        id: doc._id,
        externalId: doc.origin.externalId,
        title: doc.title,
        description: doc.description,
        type: doc.type,
        format: doc.format,
        language: doc.language,
        schemaVersion: doc.schemaVersion,
        stateSpec: doc.stateSpec,
        currentVersion: doc.currentVersion,
        body: body.body,
        refs: refs.map((ref) => ({ kind: ref.kind, target: ref.target })),
        state: state
          ? { data: state.data, updatedAt: state.updatedAt }
          : undefined,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        deletedAt: doc.deletedAt,
      });
    }
    return {
      items,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// Rollback: HARD-deletes the user's artifacts imported from `client` (rows
// with an externalId) with their bodies, versions, state and refs. Dry run
// (the default) counts up to 200 matches. A real run deletes a small batch and
// reschedules itself while rows are left.
export const removeImportedInternal = internalMutation({
  args: {
    clerkId: v.string(),
    client: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    matched: v.number(),
    deleted: v.number(),
    more: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const userId = await requireUserId(ctx, args.clerkId);
    const imported = ctx.db
      .query("artifacts")
      .withIndex("by_user_origin", (q) =>
        q
          .eq("userId", userId)
          .eq("origin.client", args.client)
          .gte("origin.externalId", ""),
      );
    if (dryRun) {
      const rows = await imported.take(REMOVE_DRY_RUN_MAX + 1);
      return {
        dryRun,
        matched: Math.min(rows.length, REMOVE_DRY_RUN_MAX),
        deleted: 0,
        more: rows.length > REMOVE_DRY_RUN_MAX,
      };
    }
    const rows = await imported.take(PURGE_ARTIFACTS_BATCH);
    let deleted = 0;
    let more = rows.length === PURGE_ARTIFACTS_BATCH;
    for (const doc of rows) {
      if (await deleteArtifactTree(ctx, doc._id)) deleted += 1;
      else more = true;
    }
    if (more) {
      await ctx.scheduler.runAfter(
        0,
        internal.artifacts.internal.removeImportedInternal,
        { clerkId: args.clerkId, client: args.client, dryRun: false },
      );
    }
    return { dryRun, matched: rows.length, deleted, more };
  },
});
