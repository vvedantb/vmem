import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authMutation, authQuery } from "../auth";
import { userFacingError } from "../lib/userFacingError";
import {
  assertContentDeletable,
  assertContentEditable,
  requireContentScopeAccess,
} from "../teams/auth";
import {
  artifactOriginValidator,
  artifactRefKindValidator,
  artifactStateSpecValidator,
  artifactTypeValidator,
  artifactFormatValidator,
} from "../validators";
import {
  createArtifact,
  findByOrigin,
  getDetail,
  getState as readState,
  linkRef,
  listArtifactRefs,
  listArtifacts,
  listVersions,
  readArtifact,
  restoreFromTrash,
  restoreVersion as restoreArtifactVersion,
  searchArtifacts,
  softDelete,
  unlinkRef,
  updateArtifact,
  writeState,
} from "./store";

// public artifact functions for the web app and direct clients. Personal rows
// have no teamId; team rows are shared with members (like files and skills).

const WEB_CLIENT = "web";

async function requireReadable(
  ctx: QueryCtx | MutationCtx,
  userId: Doc<"users">["_id"],
  id: string,
): Promise<Doc<"artifacts">> {
  const doc = await readArtifact(ctx, userId, id);
  if (!doc) userFacingError("Artifact not found");
  return doc;
}

async function requireEditable(
  ctx: MutationCtx,
  userId: Doc<"users">["_id"],
  id: string,
): Promise<Doc<"artifacts">> {
  const doc = await requireReadable(ctx, userId, id);
  await assertContentEditable(ctx, doc, userId);
  return doc;
}

const refValidator = v.object({
  kind: artifactRefKindValidator,
  target: v.string(),
});

export const list = authQuery({
  args: {
    teamId: v.optional(v.id("teams")),
    type: v.optional(artifactTypeValidator),
    ref: v.optional(refValidator),
    includeDeleted: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    return await listArtifacts(ctx, { ...args, userId: ctx.userId });
  },
});

// by id, or by the caller's own {client, externalId}; null when missing,
// unreadable or the version was pruned
export const get = authQuery({
  args: {
    id: v.optional(v.string()),
    client: v.optional(v.string()),
    externalId: v.optional(v.string()),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let doc: Doc<"artifacts"> | null = null;
    if (args.id !== undefined) {
      doc = await readArtifact(ctx, ctx.userId, args.id);
    } else if (args.client !== undefined && args.externalId !== undefined) {
      doc = await findByOrigin(ctx, ctx.userId, args.client, args.externalId);
    } else {
      userFacingError("Pass id, or client and externalId");
    }
    if (!doc) return null;
    return await getDetail(ctx, doc, args.version);
  },
});

export const search = authQuery({
  args: {
    q: v.string(),
    type: v.optional(artifactTypeValidator),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    return await searchArtifacts(ctx, { ...args, userId: ctx.userId });
  },
});

export const create = authMutation({
  args: {
    teamId: v.optional(v.id("teams")),
    title: v.string(),
    description: v.optional(v.string()),
    type: artifactTypeValidator,
    format: artifactFormatValidator,
    language: v.optional(v.string()),
    schemaVersion: v.optional(v.number()),
    stateSpec: v.optional(artifactStateSpecValidator),
    body: v.string(),
    origin: v.optional(artifactOriginValidator),
  },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    return await createArtifact(ctx, {
      ...args,
      userId: ctx.userId,
      origin: args.origin ?? { client: WEB_CLIENT },
    });
  },
});

export const update = authMutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    // "" clears it
    description: v.optional(v.string()),
    language: v.optional(v.string()),
    stateSpec: v.optional(artifactStateSpecValidator),
    body: v.optional(v.string()),
    client: v.optional(v.string()),
  },
  handler: async (ctx, { id, client, ...input }) => {
    const doc = await requireEditable(ctx, ctx.userId, id);
    return await updateArtifact(ctx, doc, ctx.userId, {
      ...input,
      client: client ?? WEB_CLIENT,
    });
  },
});

// soft delete: hidden from list and search, purged 30 days later
export const remove = authMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const doc = await requireReadable(ctx, ctx.userId, args.id);
    await assertContentDeletable(ctx, doc, ctx.userId);
    await softDelete(ctx, doc);
  },
});

// back from the trash
export const restore = authMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const doc = await requireReadable(ctx, ctx.userId, args.id);
    await assertContentDeletable(ctx, doc, ctx.userId);
    await restoreFromTrash(ctx, doc);
  },
});

export const history = authQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const doc = await requireReadable(ctx, ctx.userId, args.id);
    return await listVersions(ctx, doc._id);
  },
});

export const getVersion = authQuery({
  args: { id: v.string(), version: v.number() },
  handler: async (ctx, args) => {
    const doc = await requireReadable(ctx, ctx.userId, args.id);
    return await getDetail(ctx, doc, args.version);
  },
});

export const restoreVersion = authMutation({
  args: { id: v.string(), version: v.number(), client: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const doc = await requireEditable(ctx, ctx.userId, args.id);
    return await restoreArtifactVersion(
      ctx,
      doc,
      ctx.userId,
      args.version,
      args.client ?? WEB_CLIENT,
    );
  },
});

// state is per user, so each team member keeps their own
export const getState = authQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const doc = await requireReadable(ctx, ctx.userId, args.id);
    return await readState(ctx, doc, ctx.userId);
  },
});

export const putState = authMutation({
  args: {
    id: v.string(),
    sets: v.optional(v.record(v.string(), v.string())),
    removes: v.optional(v.array(v.string())),
    reset: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const doc = await requireReadable(ctx, ctx.userId, id);
    return await writeState(ctx, doc, ctx.userId, patch);
  },
});

export const resetState = authMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const doc = await requireReadable(ctx, ctx.userId, args.id);
    return await writeState(ctx, doc, ctx.userId, { reset: true });
  },
});

export const refs = authQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const doc = await requireReadable(ctx, ctx.userId, args.id);
    return await listArtifactRefs(ctx, doc._id);
  },
});

export const link = authMutation({
  args: { id: v.string(), ...refValidator.fields },
  handler: async (ctx, args) => {
    const doc = await requireEditable(ctx, ctx.userId, args.id);
    return await linkRef(ctx, doc, ctx.userId, args.kind, args.target);
  },
});

export const unlink = authMutation({
  args: { id: v.string(), ...refValidator.fields },
  handler: async (ctx, args) => {
    const doc = await requireEditable(ctx, ctx.userId, args.id);
    return await unlinkRef(ctx, doc, args.kind, args.target);
  },
});
