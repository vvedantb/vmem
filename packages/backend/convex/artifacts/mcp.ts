import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  mcpContentScopeArgs,
  resolveMcpContentScope,
} from "../profiles/mcpAccess";
import {
  artifactFormatValidator,
  artifactOriginValidator,
  artifactRefKindValidator,
  artifactStateSpecValidator,
  artifactTypeValidator,
} from "../validators";
import {
  ARTIFACT_SEARCH_TAKE,
  createArtifact,
  findByOrigin,
  getDetail,
  getState,
  linkRef,
  listArtifactRefs,
  listArtifacts,
  listVersions,
  requireDeletableArtifact,
  requireEditableArtifact,
  requireReadableArtifact,
  restoreFromTrash,
  restoreVersion,
  searchArtifacts,
  softDelete,
  unlinkRef,
  updateArtifact,
  writeState,
  type ArtifactDetail,
} from "./store";

// *ByClerkIdInternal functions behind the artifacts_* mcp tools. The personal
// connector sees the caller's personal artifacts; /mcp/team sees the active
// team profile's artifacts. Rows of the other scope read as "not found".

const MCP_CLIENT = "mcp";

const refValidator = v.object({
  kind: artifactRefKindValidator,
  target: v.string(),
});

const bodyArgs = {
  includeBody: v.optional(v.boolean()),
  maxChars: v.optional(v.number()),
};

// the detail without the body, or with the body cut to maxChars
export function toMcpDetail(
  detail: ArtifactDetail,
  opts: { includeBody?: boolean; maxChars?: number },
) {
  const { body, ...meta } = detail;
  const bodyChars = body.length;
  if (opts.includeBody === false) return { ...meta, bodyChars };
  const cut =
    opts.maxChars !== undefined && bodyChars > opts.maxChars
      ? body.slice(0, Math.max(0, opts.maxChars))
      : body;
  return { ...meta, bodyChars, truncated: cut.length < bodyChars, body: cut };
}

export const listByClerkIdInternal = internalQuery({
  args: {
    ...mcpContentScopeArgs,
    type: v.optional(artifactTypeValidator),
    ref: v.optional(refValidator),
    limit: v.number(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, args);
    const result = await listArtifacts(ctx, {
      userId,
      teamId,
      type: args.type,
      ref: args.ref,
      paginationOpts: { numItems: args.limit, cursor: args.cursor ?? null },
    });
    return {
      artifacts: result.page,
      nextCursor: result.isDone ? null : result.continueCursor,
    };
  },
});

// by id, or by the caller's own {client, externalId}; null when missing or
// the version was pruned
export const getByClerkIdInternal = internalQuery({
  args: {
    ...mcpContentScopeArgs,
    id: v.optional(v.string()),
    client: v.optional(v.string()),
    externalId: v.optional(v.string()),
    version: v.optional(v.number()),
    ...bodyArgs,
  },
  handler: async (ctx, args) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, args);
    let doc: Doc<"artifacts"> | null;
    if (args.id !== undefined) {
      doc = await requireReadableArtifact(ctx, userId, args.id, { teamId });
    } else if (args.client !== undefined && args.externalId !== undefined) {
      doc = await findByOrigin(ctx, userId, args.client, args.externalId);
      if (doc && doc.teamId !== teamId) doc = null;
    } else {
      throw new Error("Pass id, or client and externalId");
    }
    if (!doc) return null;
    const detail = await getDetail(ctx, doc, args.version);
    if (!detail) return null;
    return {
      ...toMcpDetail(detail, args),
      refs: await listArtifactRefs(ctx, doc._id),
    };
  },
});

export const searchByClerkIdInternal = internalQuery({
  args: {
    ...mcpContentScopeArgs,
    query: v.string(),
    type: v.optional(artifactTypeValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, args);
    const rows = await searchArtifacts(ctx, {
      userId,
      teamId,
      q: args.query,
      type: args.type,
    });
    return rows.slice(0, args.limit ?? ARTIFACT_SEARCH_TAKE);
  },
});

export const saveByClerkIdInternal = internalMutation({
  args: {
    ...mcpContentScopeArgs,
    title: v.string(),
    type: artifactTypeValidator,
    format: artifactFormatValidator,
    body: v.string(),
    description: v.optional(v.string()),
    language: v.optional(v.string()),
    schemaVersion: v.optional(v.number()),
    stateSpec: v.optional(artifactStateSpecValidator),
    refs: v.optional(v.array(refValidator)),
    origin: v.optional(artifactOriginValidator),
  },
  handler: async (ctx, { clerkId, scope, refs, origin, ...input }) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, {
      clerkId,
      scope,
    });
    const saved = await createArtifact(ctx, {
      ...input,
      userId,
      teamId,
      origin: origin ?? { client: MCP_CLIENT },
    });
    // an existing artifact (same origin) is returned unchanged
    if (saved.created && refs !== undefined) {
      const doc = await requireReadableArtifact(ctx, userId, saved.id);
      for (const ref of refs) {
        await linkRef(ctx, doc, userId, ref.kind, ref.target);
      }
    }
    return saved;
  },
});

export const updateByClerkIdInternal = internalMutation({
  args: {
    ...mcpContentScopeArgs,
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    language: v.optional(v.string()),
    stateSpec: v.optional(artifactStateSpecValidator),
    body: v.optional(v.string()),
  },
  handler: async (ctx, { clerkId, scope, id, ...input }) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, {
      clerkId,
      scope,
    });
    const doc = await requireEditableArtifact(ctx, userId, id, { teamId });
    return {
      id: doc._id,
      ...(await updateArtifact(ctx, doc, userId, {
        ...input,
        client: MCP_CLIENT,
      })),
    };
  },
});

const idArgs = { ...mcpContentScopeArgs, id: v.string() };

export const deleteByClerkIdInternal = internalMutation({
  args: idArgs,
  handler: async (ctx, args) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, args);
    const doc = await requireDeletableArtifact(ctx, userId, args.id, {
      teamId,
    });
    await softDelete(ctx, doc);
    return { id: doc._id, deleted: true };
  },
});

export const restoreByClerkIdInternal = internalMutation({
  args: idArgs,
  handler: async (ctx, args) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, args);
    const doc = await requireDeletableArtifact(ctx, userId, args.id, {
      teamId,
    });
    await restoreFromTrash(ctx, doc);
    return { id: doc._id, restored: true };
  },
});

export const historyByClerkIdInternal = internalQuery({
  args: idArgs,
  handler: async (ctx, args) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, args);
    const doc = await requireReadableArtifact(ctx, userId, args.id, {
      teamId,
    });
    return {
      id: doc._id,
      currentVersion: doc.currentVersion,
      versions: await listVersions(ctx, doc._id),
    };
  },
});

export const restoreVersionByClerkIdInternal = internalMutation({
  args: { ...idArgs, version: v.number() },
  handler: async (ctx, args) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, args);
    const doc = await requireEditableArtifact(ctx, userId, args.id, {
      teamId,
    });
    return {
      id: doc._id,
      ...(await restoreVersion(ctx, doc, userId, args.version, MCP_CLIENT)),
    };
  },
});

// state is per user, so each team member keeps their own
export const getStateByClerkIdInternal = internalQuery({
  args: idArgs,
  handler: async (ctx, args) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, args);
    const doc = await requireReadableArtifact(ctx, userId, args.id, {
      teamId,
    });
    return await getState(ctx, doc, userId);
  },
});

export const putStateByClerkIdInternal = internalMutation({
  args: {
    ...idArgs,
    sets: v.optional(v.record(v.string(), v.string())),
    removes: v.optional(v.array(v.string())),
    reset: v.optional(v.boolean()),
  },
  handler: async (ctx, { clerkId, scope, id, ...patch }) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, {
      clerkId,
      scope,
    });
    const doc = await requireReadableArtifact(ctx, userId, id, { teamId });
    return await writeState(ctx, doc, userId, patch);
  },
});

export const linkByClerkIdInternal = internalMutation({
  args: {
    ...idArgs,
    add: v.optional(v.array(refValidator)),
    remove: v.optional(v.array(refValidator)),
  },
  handler: async (ctx, args) => {
    const { userId, teamId } = await resolveMcpContentScope(ctx, args);
    const doc = await requireEditableArtifact(ctx, userId, args.id, {
      teamId,
    });
    for (const ref of args.remove ?? []) {
      await unlinkRef(ctx, doc, ref.kind, ref.target);
    }
    for (const ref of args.add ?? []) {
      await linkRef(ctx, doc, userId, ref.kind, ref.target);
    }
    return { id: doc._id, refs: await listArtifactRefs(ctx, doc._id) };
  },
});
