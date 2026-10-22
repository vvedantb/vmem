import {
  ARTIFACT_DESCRIPTION_MAX_CHARS,
  ARTIFACT_STATE_DAILY_WRITES,
  ARTIFACT_STATE_MIN_WRITE_INTERVAL_MS,
  ARTIFACT_TITLE_MAX_CHARS,
  ARTIFACT_VERSION_KEEP,
  applyArtifactStatePatch,
  createArtifactSchemas,
  sha256Hex,
  utcDayKey,
  utf8ByteLength,
  validateArtifactStateMap,
  type ArtifactFormat,
  type ArtifactListRow,
  type ArtifactOrigin,
  type ArtifactStateMap,
  type ArtifactStatePatch,
  type ArtifactStateSpec,
  type ArtifactType,
  type FlashcardsBodyV1,
  type QuizBodyV1,
} from "@vvedantb/server";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { ConvexError } from "convex/values";
import { z } from "zod";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  memoryMatchesScope,
  type MemoryReadScope,
} from "../../engine/memory/scope";
import { userFacingError } from "../lib/userFacingError";
import { findByMemoryId } from "../memoryStore/helpers";
import {
  assertContentDeletable,
  assertContentEditable,
  isContentReadable,
} from "../teams/auth";
import { truncateWellFormed } from "../lib/wellFormed";

// artifact store helpers, shared by artifacts/api.ts, artifacts/mcp.ts (the
// mcp tools) and the vibot import (artifacts/internal.ts). Bodies are immutable rows; versions point at them.

export const artifactSchemas = createArtifactSchemas(z);

const DAY_MS = 24 * 60 * 60 * 1000;
export const ARTIFACT_TRASH_MS = 30 * DAY_MS;
export const ARTIFACT_LIST_PAGE_MAX = 100;
export const ARTIFACT_SEARCH_TAKE = 20;
export const ARTIFACT_REFS_MAX = 100;
// memory refs resolved to titles per read; the rest show the bare id
export const ARTIFACT_MEMORY_REFS_RESOLVE_MAX = 50;
const MEMORY_REF_TITLE_MAX_CHARS = 120;
// vmem has no plans yet, so every user gets the free daily cap
export const ARTIFACT_STATE_DAILY_CAP = ARTIFACT_STATE_DAILY_WRITES.free;
const SEARCH_TEXT_MAX_BYTES = 8 * 1024;
const ORIGIN_CLIENT_MAX_CHARS = 64;
const ORIGIN_EXTERNAL_ID_MAX_CHARS = 256;
const REF_TARGET_MAX_CHARS = 512;
// prune runs on every new version, so the excess is 1 row in practice
const PRUNE_BATCH = 50;
// purge reads bodies (≤ 400 KB each, ≤ 11 per artifact), so few per batch
export const PURGE_ARTIFACTS_BATCH = 2;
const PURGE_CHILD_BATCH = 100;
const PURGE_BODY_BATCH = ARTIFACT_VERSION_KEEP + 2;

export type ArtifactRefKind = Doc<"artifactRefs">["kind"];
// mirrors artifactRefKindValidator (validators.ts may not import this module)
export const ARTIFACT_REF_KINDS = [
  "memory",
  "file",
  "source",
  "skill",
  "app",
] as const satisfies readonly ArtifactRefKind[];

export interface ArtifactDetail extends ArtifactListRow {
  body: string;
  // the version whose body this is (currentVersion unless asked otherwise)
  version: number;
  deletedAt?: number;
}

export interface ArtifactStateView {
  data: ArtifactStateMap;
  stateVersion: number;
  updatedAt: number;
}

// ---- validation ----

function checkTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) userFacingError("Title is required");
  if (trimmed.length > ARTIFACT_TITLE_MAX_CHARS) {
    userFacingError(`Title is over ${ARTIFACT_TITLE_MAX_CHARS} characters`);
  }
  return trimmed;
}

// empty clears the description
function checkDescription(description: string | undefined): string | undefined {
  const trimmed = description?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > ARTIFACT_DESCRIPTION_MAX_CHARS) {
    userFacingError(
      `Description is over ${ARTIFACT_DESCRIPTION_MAX_CHARS} characters`,
    );
  }
  return trimmed;
}

function checkStateSpec(
  stateSpec: ArtifactStateSpec | undefined,
): ArtifactStateSpec | undefined {
  if (stateSpec === undefined) return undefined;
  const parsed = artifactSchemas.stateSpec.safeParse(stateSpec);
  if (!parsed.success) userFacingError("Invalid stateSpec");
  return parsed.data;
}

function checkOrigin(origin: ArtifactOrigin): ArtifactOrigin {
  const client = origin.client.trim();
  if (client.length === 0 || client.length > ORIGIN_CLIENT_MAX_CHARS) {
    userFacingError("Invalid origin client");
  }
  const externalId = origin.externalId?.trim();
  if (externalId !== undefined) {
    if (
      externalId.length === 0 ||
      externalId.length > ORIGIN_EXTERNAL_ID_MAX_CHARS
    ) {
      userFacingError("Invalid origin externalId");
    }
    return { client, externalId };
  }
  return { client };
}

// the shared core checks the size cap and typed json bodies; returns the
// plain text for searchText
function checkBody(
  type: ArtifactType,
  format: ArtifactFormat,
  body: string,
  schemaVersion: number,
): string {
  const checked = artifactSchemas.validateArtifactBody(
    type,
    format,
    body,
    schemaVersion,
  );
  if (!checked.ok) userFacingError(checked.error);
  return bodyPlainText(format, body, checked.json);
}

// ---- search text ----

function jsonPlainText(json: QuizBodyV1 | FlashcardsBodyV1): string {
  if ("questions" in json) {
    return [
      json.title,
      ...json.questions.flatMap((q) => [q.prompt, ...q.options]),
    ].join("\n");
  }
  return [json.title, ...json.cards.flatMap((c) => [c.front, c.back])].join(
    "\n",
  );
}

function markupPlainText(markup: string): string {
  return markup
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function bodyPlainText(
  format: ArtifactFormat,
  body: string,
  json: QuizBodyV1 | FlashcardsBodyV1 | undefined,
): string {
  if (json !== undefined) return jsonPlainText(json);
  if (format === "html" || format === "svg") return markupPlainText(body);
  return body;
}

function capUtf8(text: string, maxBytes: number): string {
  if (utf8ByteLength(text) <= maxBytes) return text;
  const bytes = new TextEncoder().encode(text).slice(0, maxBytes);
  // a cut multi-byte char decodes to U+FFFD
  return new TextDecoder().decode(bytes).replace(/�+$/, "");
}

export function buildSearchText(
  title: string,
  description: string | undefined,
  plainText: string,
): string {
  return capUtf8(
    [title, description, plainText].filter(Boolean).join("\n"),
    SEARCH_TEXT_MAX_BYTES,
  );
}

// ---- rows ----

// metadata only; never reads the body
export function toListRow(doc: Doc<"artifacts">): ArtifactListRow {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    type: doc.type,
    format: doc.format,
    language: doc.language,
    schemaVersion: doc.schemaVersion,
    stateSpec: doc.stateSpec,
    currentVersion: doc.currentVersion,
    size: doc.size,
    origin: doc.origin,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    teamId: doc.teamId,
  };
}

// the artifact when the caller may read it (owner, or team member), else null
export async function readArtifact(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  id: string,
): Promise<Doc<"artifacts"> | null> {
  const artifactId = ctx.db.normalizeId("artifacts", id);
  if (!artifactId) return null;
  const doc = await ctx.db.get(artifactId);
  if (!doc || !(await isContentReadable(ctx, doc, userId))) return null;
  return doc;
}

// mcp connectors see one scope: the team's rows on /mcp/team, the caller's
// personal rows on /mcp
export interface ArtifactScope {
  teamId: Id<"teams"> | undefined;
}

// readable (and in `scope` when given), else "Artifact not found"
export async function requireReadableArtifact(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  id: string,
  scope?: ArtifactScope,
): Promise<Doc<"artifacts">> {
  const doc = await readArtifact(ctx, userId, id);
  if (!doc || (scope && !inScope(doc, userId, scope.teamId))) {
    userFacingError("Artifact not found");
  }
  return doc;
}

export async function requireEditableArtifact(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: string,
  scope?: ArtifactScope,
): Promise<Doc<"artifacts">> {
  const doc = await requireReadableArtifact(ctx, userId, id, scope);
  await assertContentEditable(ctx, doc, userId);
  return doc;
}

export async function requireDeletableArtifact(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: string,
  scope?: ArtifactScope,
): Promise<Doc<"artifacts">> {
  const doc = await requireReadableArtifact(ctx, userId, id, scope);
  await assertContentDeletable(ctx, doc, userId);
  return doc;
}

export async function findByOrigin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  client: string,
  externalId: string,
): Promise<Doc<"artifacts"> | null> {
  return await ctx.db
    .query("artifacts")
    .withIndex("by_user_origin", (q) =>
      q
        .eq("userId", userId)
        .eq("origin.client", client)
        .eq("origin.externalId", externalId),
    )
    .first();
}

async function findVersion(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  version: number,
): Promise<Doc<"artifactVersions"> | null> {
  return await ctx.db
    .query("artifactVersions")
    .withIndex("by_artifact_version", (q) =>
      q.eq("artifactId", artifactId).eq("version", version),
    )
    .first();
}

// list row + body of the current version, or of `version` (null if pruned)
export async function getDetail(
  ctx: QueryCtx | MutationCtx,
  doc: Doc<"artifacts">,
  version?: number,
): Promise<ArtifactDetail | null> {
  let bodyId = doc.currentBodyId;
  let row = toListRow(doc);
  if (version !== undefined && version !== doc.currentVersion) {
    const versionRow = await findVersion(ctx, doc._id, version);
    if (!versionRow) return null;
    bodyId = versionRow.bodyId;
    row = { ...row, title: versionRow.title, stateSpec: versionRow.stateSpec };
  }
  const body = await ctx.db.get(bodyId);
  if (!body) return null;
  return {
    ...row,
    body: body.body,
    version: version ?? doc.currentVersion,
    deletedAt: doc.deletedAt,
  };
}

// newest first, metadata only
export async function listVersions(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
): Promise<
  Array<{
    version: number;
    title: string;
    createdAt: number;
    createdBy: string;
  }>
> {
  const rows = await ctx.db
    .query("artifactVersions")
    .withIndex("by_artifact_version", (q) => q.eq("artifactId", artifactId))
    .order("desc")
    .take(ARTIFACT_VERSION_KEEP);
  return rows.map((r) => ({
    version: r.version,
    title: r.title,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
  }));
}

// ---- list / search ----

export interface ListArtifactsArgs {
  userId: Id<"users">;
  teamId?: Id<"teams">;
  type?: ArtifactType;
  ref?: { kind: ArtifactRefKind; target: string };
  includeDeleted?: boolean;
  paginationOpts: PaginationOptions;
}

function inScope(
  doc: Doc<"artifacts">,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): boolean {
  if (teamId !== undefined) return doc.teamId === teamId;
  return doc.teamId === undefined && doc.userId === userId;
}

// paginated metadata rows; reads artifacts (and refs), never artifactBodies.
// Callers check scope access first.
export async function listArtifacts(
  ctx: QueryCtx,
  args: ListArtifactsArgs,
): Promise<PaginationResult<ArtifactListRow>> {
  const paginationOpts = {
    ...args.paginationOpts,
    numItems: Math.min(args.paginationOpts.numItems, ARTIFACT_LIST_PAGE_MAX),
  };
  const { userId, teamId, type } = args;
  const keep = (doc: Doc<"artifacts">) =>
    inScope(doc, userId, teamId) &&
    (type === undefined || doc.type === type) &&
    (args.includeDeleted === true || doc.deletedAt === undefined);

  if (args.ref !== undefined) {
    const refKey = `${args.ref.kind}:${args.ref.target}`;
    const refs = await ctx.db
      .query("artifactRefs")
      .withIndex("by_user_ref", (q) =>
        q.eq("userId", userId).eq("refKey", refKey),
      )
      .order("desc")
      .paginate(paginationOpts);
    const page: ArtifactListRow[] = [];
    for (const ref of refs.page) {
      const doc = await ctx.db.get(ref.artifactId);
      if (doc && keep(doc)) page.push(toListRow(doc));
    }
    return { ...refs, page };
  }

  const base =
    teamId !== undefined
      ? ctx.db
          .query("artifacts")
          .withIndex("by_team_updated", (q) => q.eq("teamId", teamId))
      : type !== undefined
        ? ctx.db
            .query("artifacts")
            .withIndex("by_user_type_updated", (q) =>
              q.eq("userId", userId).eq("type", type),
            )
        : ctx.db
            .query("artifacts")
            .withIndex("by_user_updated", (q) => q.eq("userId", userId));
  const result = await base
    .order("desc")
    .filter((q) =>
      q.and(
        teamId === undefined
          ? q.eq(q.field("teamId"), undefined)
          : q.eq(q.field("teamId"), teamId),
        type === undefined ? true : q.eq(q.field("type"), type),
        args.includeDeleted === true
          ? true
          : q.eq(q.field("deletedAt"), undefined),
      ),
    )
    .paginate(paginationOpts);
  return { ...result, page: result.page.map(toListRow) };
}

// full-text search over searchText; take 20, live rows only. Personal search
// filters on userId (rows without teamId), team search on teamId.
export async function searchArtifacts(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    teamId?: Id<"teams">;
    q: string;
    type?: ArtifactType;
  },
): Promise<ArtifactListRow[]> {
  const text = args.q.trim();
  if (text.length === 0) return [];
  const { userId, teamId, type } = args;
  const rows = await ctx.db
    .query("artifacts")
    .withSearchIndex("search_text", (s) => {
      const base = s.search("searchText", text);
      const scoped =
        teamId !== undefined
          ? base.eq("teamId", teamId)
          : base.eq("userId", userId);
      return type !== undefined ? scoped.eq("type", type) : scoped;
    })
    .take(ARTIFACT_SEARCH_TAKE);
  return rows
    .filter(
      (doc) => inScope(doc, userId, teamId) && doc.deletedAt === undefined,
    )
    .map(toListRow);
}

// ---- writes ----

// same body text in the same artifact reuses its body row
async function putBody(
  ctx: MutationCtx,
  artifactId: Id<"artifacts"> | undefined,
  userId: Id<"users">,
  body: string,
  now: number,
): Promise<Id<"artifactBodies">> {
  const sha256 = await sha256Hex(body);
  if (artifactId !== undefined) {
    const existing = await ctx.db
      .query("artifactBodies")
      .withIndex("by_artifact", (q) =>
        q.eq("artifactId", artifactId).eq("sha256", sha256),
      )
      .first();
    if (existing) return existing._id;
  }
  return await ctx.db.insert("artifactBodies", {
    artifactId,
    userId,
    body,
    sha256,
    createdAt: now,
  });
}

export interface CreateArtifactInput {
  userId: Id<"users">;
  teamId?: Id<"teams">;
  title: string;
  description?: string;
  type: ArtifactType;
  format: ArtifactFormat;
  language?: string;
  schemaVersion?: number;
  stateSpec?: ArtifactStateSpec;
  body: string;
  origin: ArtifactOrigin;
}

// idempotent by origin: the same user + client + externalId returns the
// existing artifact unchanged
export async function createArtifact(
  ctx: MutationCtx,
  input: CreateArtifactInput,
): Promise<{ id: Id<"artifacts">; created: boolean }> {
  const origin = checkOrigin(input.origin);
  if (origin.externalId !== undefined) {
    const existing = await findByOrigin(
      ctx,
      input.userId,
      origin.client,
      origin.externalId,
    );
    if (existing) return { id: existing._id, created: false };
  }
  const title = checkTitle(input.title);
  const description = checkDescription(input.description);
  const stateSpec = checkStateSpec(input.stateSpec);
  const schemaVersion = input.schemaVersion ?? 1;
  const plainText = checkBody(
    input.type,
    input.format,
    input.body,
    schemaVersion,
  );
  const now = Date.now();
  // the artifact row needs the body id, so the body gets its artifactId after
  const bodyId = await putBody(ctx, undefined, input.userId, input.body, now);
  const id = await ctx.db.insert("artifacts", {
    userId: input.userId,
    teamId: input.teamId,
    title,
    description,
    type: input.type,
    format: input.format,
    language: input.language,
    schemaVersion,
    stateSpec,
    currentVersion: 1,
    currentBodyId: bodyId,
    size: utf8ByteLength(input.body),
    searchText: buildSearchText(title, description, plainText),
    origin,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(bodyId, { artifactId: id });
  await ctx.db.insert("artifactVersions", {
    artifactId: id,
    userId: input.userId,
    version: 1,
    bodyId,
    title,
    stateSpec,
    createdAt: now,
    createdBy: origin.client,
  });
  return { id, created: true };
}

interface Revision {
  title: string;
  description: string | undefined;
  language: string | undefined;
  stateSpec: ArtifactStateSpec | undefined;
  bodyId: Id<"artifactBodies">;
  body: string;
  plainText: string;
}

function sameStateSpec(
  a: ArtifactStateSpec | undefined,
  b: ArtifactStateSpec | undefined,
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// patch the row; a change to body, title or stateSpec adds a version
async function commitRevision(
  ctx: MutationCtx,
  doc: Doc<"artifacts">,
  userId: Id<"users">,
  next: Revision,
  client: string,
): Promise<{ version: number; versioned: boolean }> {
  const now = Date.now();
  const versioned =
    next.bodyId !== doc.currentBodyId ||
    next.title !== doc.title ||
    !sameStateSpec(next.stateSpec, doc.stateSpec);
  const version = versioned ? doc.currentVersion + 1 : doc.currentVersion;
  await ctx.db.patch(doc._id, {
    title: next.title,
    description: next.description,
    language: next.language,
    stateSpec: next.stateSpec,
    currentVersion: version,
    currentBodyId: next.bodyId,
    size: utf8ByteLength(next.body),
    searchText: buildSearchText(next.title, next.description, next.plainText),
    updatedAt: now,
  });
  if (versioned) {
    await ctx.db.insert("artifactVersions", {
      artifactId: doc._id,
      userId,
      version,
      bodyId: next.bodyId,
      title: next.title,
      stateSpec: next.stateSpec,
      createdAt: now,
      createdBy: client,
    });
    await pruneVersions(ctx, doc._id, next.bodyId);
  }
  return { version, versioned };
}

function assertNotDeleted(doc: Doc<"artifacts">): void {
  if (doc.deletedAt !== undefined) userFacingError("Artifact is in the trash");
}

export interface UpdateArtifactInput {
  title?: string;
  description?: string;
  language?: string;
  stateSpec?: ArtifactStateSpec;
  body?: string;
  // origin.client of the writer, kept on the version row
  client: string;
}

// new body → new body row (unless the same text exists) + new version;
// title-only edits add a version pointing at the current body
export async function updateArtifact(
  ctx: MutationCtx,
  doc: Doc<"artifacts">,
  userId: Id<"users">,
  input: UpdateArtifactInput,
): Promise<{ version: number; versioned: boolean }> {
  assertNotDeleted(doc);
  const title = input.title === undefined ? doc.title : checkTitle(input.title);
  const description =
    input.description === undefined
      ? doc.description
      : checkDescription(input.description);
  const stateSpec =
    input.stateSpec === undefined
      ? doc.stateSpec
      : checkStateSpec(input.stateSpec);
  let bodyId = doc.currentBodyId;
  let body: string;
  if (input.body !== undefined) {
    body = input.body;
    bodyId = await putBody(ctx, doc._id, userId, body, Date.now());
  } else {
    const current = await ctx.db.get(doc.currentBodyId);
    if (!current) throw new Error("Artifact body missing");
    body = current.body;
  }
  const plainText = checkBody(doc.type, doc.format, body, doc.schemaVersion);
  return await commitRevision(
    ctx,
    doc,
    userId,
    {
      title,
      description,
      language: input.language ?? doc.language,
      stateSpec,
      bodyId,
      body,
      plainText,
    },
    input.client,
  );
}

// a new version with the old version's body, title and stateSpec
export async function restoreVersion(
  ctx: MutationCtx,
  doc: Doc<"artifacts">,
  userId: Id<"users">,
  version: number,
  client: string,
): Promise<{ version: number; versioned: boolean }> {
  assertNotDeleted(doc);
  const versionRow = await findVersion(ctx, doc._id, version);
  if (!versionRow) userFacingError("Version not found");
  const body = await ctx.db.get(versionRow.bodyId);
  if (!body) throw new Error("Artifact body missing");
  const plainText = checkBody(
    doc.type,
    doc.format,
    body.body,
    doc.schemaVersion,
  );
  return await commitRevision(
    ctx,
    doc,
    userId,
    {
      title: versionRow.title,
      description: doc.description,
      language: doc.language,
      stateSpec: versionRow.stateSpec,
      bodyId: versionRow.bodyId,
      body: body.body,
      plainText,
    },
    client,
  );
}

// keep the newest ARTIFACT_VERSION_KEEP versions; a pruned version's body row
// goes too unless the current body or a kept version points at it
export async function pruneVersions(
  ctx: MutationCtx,
  artifactId: Id<"artifacts">,
  currentBodyId: Id<"artifactBodies">,
): Promise<number> {
  const rows = await ctx.db
    .query("artifactVersions")
    .withIndex("by_artifact_version", (q) => q.eq("artifactId", artifactId))
    .order("desc")
    .take(ARTIFACT_VERSION_KEEP + PRUNE_BATCH);
  const kept = rows.slice(0, ARTIFACT_VERSION_KEEP);
  const pruned = rows.slice(ARTIFACT_VERSION_KEEP);
  const live = new Set<Id<"artifactBodies">>([
    currentBodyId,
    ...kept.map((row) => row.bodyId),
  ]);
  const deletedBodies = new Set<Id<"artifactBodies">>();
  for (const row of pruned) {
    await ctx.db.delete(row._id);
    if (!live.has(row.bodyId) && !deletedBodies.has(row.bodyId)) {
      deletedBodies.add(row.bodyId);
      await ctx.db.delete(row.bodyId);
    }
  }
  return pruned.length;
}

export async function softDelete(
  ctx: MutationCtx,
  doc: Doc<"artifacts">,
): Promise<void> {
  if (doc.deletedAt !== undefined) return;
  await ctx.db.patch(doc._id, { deletedAt: Date.now() });
}

export async function restoreFromTrash(
  ctx: MutationCtx,
  doc: Doc<"artifacts">,
): Promise<void> {
  if (doc.deletedAt === undefined) return;
  await ctx.db.patch(doc._id, { deletedAt: undefined, updatedAt: Date.now() });
}

// ---- state ----

async function findState(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  userId: Id<"users">,
): Promise<Doc<"artifactState"> | null> {
  return await ctx.db
    .query("artifactState")
    .withIndex("by_artifact_user", (q) =>
      q.eq("artifactId", artifactId).eq("userId", userId),
    )
    .first();
}

function specStateVersion(doc: Doc<"artifacts">): number {
  return doc.stateSpec?.stateVersion ?? 1;
}

// state saved under an older stateVersion reads as empty
export async function getState(
  ctx: QueryCtx | MutationCtx,
  doc: Doc<"artifacts">,
  userId: Id<"users">,
): Promise<ArtifactStateView | null> {
  const row = await findState(ctx, doc._id, userId);
  if (!row) return null;
  const stateVersion = specStateVersion(doc);
  return {
    data: row.stateVersion === stateVersion ? row.data : {},
    stateVersion,
    updatedAt: row.updatedAt,
  };
}

// one batched state write: ≥ 1 s since the last write for this artifact and
// user, under the daily cap, and inside the shared size limits. Keys are
// convex field names (printable ascii, no leading "$"); args reject others.
export async function writeState(
  ctx: MutationCtx,
  doc: Doc<"artifacts">,
  userId: Id<"users">,
  patch: ArtifactStatePatch,
): Promise<ArtifactStateView> {
  assertNotDeleted(doc);
  const now = Date.now();
  const day = utcDayKey(now);
  const stateVersion = specStateVersion(doc);
  const row = await findState(ctx, doc._id, userId);
  if (row && now - row.lastWriteAt < ARTIFACT_STATE_MIN_WRITE_INTERVAL_MS) {
    userFacingError("State writes are limited to one per second");
  }
  const writesToday =
    row && row.dailyWriteDay === day ? row.dailyWriteCount : 0;
  if (writesToday >= ARTIFACT_STATE_DAILY_CAP) {
    userFacingError("Daily state write limit reached");
  }
  const current = row && row.stateVersion === stateVersion ? row.data : {};
  const applied = applyArtifactStatePatch(current, patch);
  if (applied.error !== undefined) userFacingError(applied.error);
  const fields = {
    data: applied.data,
    stateVersion,
    updatedAt: now,
    lastWriteAt: now,
    dailyWriteCount: writesToday + 1,
    dailyWriteDay: day,
  };
  if (row) {
    await ctx.db.patch(row._id, fields);
  } else {
    await ctx.db.insert("artifactState", {
      artifactId: doc._id,
      userId,
      ...fields,
    });
  }
  return { data: applied.data, stateVersion, updatedAt: now };
}

// ---- refs ----

function checkRefTarget(target: string): string {
  const trimmed = target.trim();
  if (trimmed.length === 0 || trimmed.length > REF_TARGET_MAX_CHARS) {
    userFacingError("Invalid ref target");
  }
  return trimmed;
}

async function listRefs(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
): Promise<Array<Doc<"artifactRefs">>> {
  return await ctx.db
    .query("artifactRefs")
    .withIndex("by_artifact", (q) => q.eq("artifactId", artifactId))
    .take(ARTIFACT_REFS_MAX);
}

// idempotent; at most ARTIFACT_REFS_MAX refs per artifact
export async function linkRef(
  ctx: MutationCtx,
  doc: Doc<"artifacts">,
  userId: Id<"users">,
  kind: ArtifactRefKind,
  target: string,
): Promise<Id<"artifactRefs">> {
  const refKey = `${kind}:${checkRefTarget(target)}`;
  const refs = await listRefs(ctx, doc._id);
  const existing = refs.find((ref) => ref.refKey === refKey);
  if (existing) return existing._id;
  if (refs.length >= ARTIFACT_REFS_MAX) userFacingError("Too many links");
  return await ctx.db.insert("artifactRefs", {
    artifactId: doc._id,
    userId,
    kind,
    target: checkRefTarget(target),
    refKey,
    createdAt: Date.now(),
  });
}

export async function unlinkRef(
  ctx: MutationCtx,
  doc: Doc<"artifacts">,
  kind: ArtifactRefKind,
  target: string,
): Promise<number> {
  const refKey = `${kind}:${target.trim()}`;
  const refs = (await listRefs(ctx, doc._id)).filter(
    (ref) => ref.refKey === refKey,
  );
  for (const ref of refs) await ctx.db.delete(ref._id);
  return refs.length;
}

export async function listArtifactRefs(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
): Promise<
  Array<{ kind: ArtifactRefKind; target: string; createdAt: number }>
> {
  return (await listRefs(ctx, artifactId)).map((ref) => ({
    kind: ref.kind,
    target: ref.target,
    createdAt: ref.createdAt,
  }));
}

export interface ArtifactRefView {
  kind: ArtifactRefKind;
  target: string;
  createdAt: number;
  // memory refs only: exists is false when the memory is gone or the caller
  // can't read it (no title then, so nothing leaks)
  exists?: boolean;
  title?: string;
}

// the memory scope of the artifact's readers: the team profile for team
// artifacts, else the caller's personal memories (like memoryApi.get)
async function artifactMemoryScope(
  ctx: QueryCtx | MutationCtx,
  doc: Doc<"artifacts">,
  userId: Id<"users">,
): Promise<MemoryReadScope | null> {
  const teamId = doc.teamId;
  if (teamId !== undefined) {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    return profile ? { kind: "team", profileId: profile._id } : null;
  }
  const clerkId = (await ctx.db.get(userId))?.clerkId;
  return clerkId ? { kind: "personal", userId: clerkId } : null;
}

function memoryRefTitle(memory: Doc<"memories">): string {
  const text = (memory.title.trim() || memory.content)
    .replace(/\s+/g, " ")
    .trim();
  return text.length > MEMORY_REF_TITLE_MAX_CHARS
    ? `${truncateWellFormed(text, MEMORY_REF_TITLE_MAX_CHARS - 1)}…`
    : text;
}

// the artifact's refs with memory titles for memories the caller may read.
// The caller must already have read access to `doc`.
export async function resolveArtifactRefs(
  ctx: QueryCtx | MutationCtx,
  doc: Doc<"artifacts">,
  userId: Id<"users">,
): Promise<ArtifactRefView[]> {
  const refs = await listArtifactRefs(ctx, doc._id);
  const scope = refs.some((ref) => ref.kind === "memory")
    ? await artifactMemoryScope(ctx, doc, userId)
    : null;
  let resolved = 0;
  const views: ArtifactRefView[] = [];
  for (const ref of refs) {
    if (ref.kind !== "memory" || resolved >= ARTIFACT_MEMORY_REFS_RESOLVE_MAX) {
      views.push(ref);
      continue;
    }
    resolved += 1;
    const memory = scope ? await findByMemoryId(ctx, ref.target) : null;
    views.push(
      memory && scope && memoryMatchesScope(memory, scope)
        ? { ...ref, exists: true, title: memoryRefTitle(memory) }
        : { ...ref, exists: false },
    );
  }
  return views;
}

// ---- import (vibot migration; see artifacts/internal.ts) ----

export interface ImportVersionInput {
  version: number;
  title: string;
  body: string;
  stateSpec?: ArtifactStateSpec;
  createdAt: number;
}

// one already-transformed artifact from another app's export
export interface ImportArtifactInput {
  title: string;
  description?: string;
  type: ArtifactType;
  format: ArtifactFormat;
  language?: string;
  schemaVersion: number;
  stateSpec?: ArtifactStateSpec;
  body: string;
  createdAt: number;
  updatedAt: number;
  origin: { client: string; externalId: string };
  refs: Array<{ kind: ArtifactRefKind; target: string }>;
  // older versions; the current body is `body`
  versions?: ImportVersionInput[];
  state?: { data: ArtifactStateMap; updatedAt: number };
}

interface CheckedImportVersion {
  version: number;
  title: string;
  body: string;
  stateSpec: ArtifactStateSpec | undefined;
  createdAt: number;
}

export interface CheckedImport {
  input: ImportArtifactInput;
  title: string;
  description: string | undefined;
  stateSpec: ArtifactStateSpec | undefined;
  origin: { client: string; externalId: string };
  plainText: string;
  // ascending; the last row is the current version
  versions: CheckedImportVersion[];
  refs: Array<{ kind: ArtifactRefKind; target: string; refKey: string }>;
  // utf-8 bytes of the distinct bodies
  bytes: number;
}

function checkTimestamp(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) userFacingError(`Invalid ${label}`);
  return value;
}

function checkImportVersion(
  input: ImportArtifactInput,
  row: ImportVersionInput,
): CheckedImportVersion {
  if (!Number.isInteger(row.version) || row.version < 1) {
    userFacingError("Invalid version number");
  }
  const label = `version ${String(row.version)}`;
  try {
    checkBody(input.type, input.format, row.body, input.schemaVersion);
    return {
      version: row.version,
      title: checkTitle(row.title),
      body: row.body,
      stateSpec: checkStateSpec(row.stateSpec),
      createdAt: checkTimestamp(row.createdAt, "createdAt"),
    };
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") {
      userFacingError(`${label}: ${error.data}`);
    }
    throw error;
  }
}

function checkImportUnsafe(input: ImportArtifactInput): CheckedImport {
  const checkedOrigin = checkOrigin(input.origin);
  if (checkedOrigin.externalId === undefined) {
    userFacingError("Invalid origin externalId");
  }
  const origin = {
    client: checkedOrigin.client,
    externalId: checkedOrigin.externalId,
  };
  const title = checkTitle(input.title);
  const description = checkDescription(input.description);
  const stateSpec = checkStateSpec(input.stateSpec);
  const plainText = checkBody(
    input.type,
    input.format,
    input.body,
    input.schemaVersion,
  );
  const createdAt = checkTimestamp(input.createdAt, "createdAt");
  const updatedAt = checkTimestamp(input.updatedAt, "updatedAt");

  const history = (input.versions ?? [])
    .map((row) => checkImportVersion(input, row))
    .sort((a, b) => a.version - b.version);
  if (history.length > ARTIFACT_VERSION_KEEP) {
    userFacingError(`Over ${String(ARTIFACT_VERSION_KEEP)} versions`);
  }
  if (new Set(history.map((row) => row.version)).size !== history.length) {
    userFacingError("Duplicate version numbers");
  }
  // the newest history row is the current version when it matches it;
  // else the current version comes after it
  const top = history.at(-1);
  const topIsCurrent =
    top !== undefined &&
    top.body === input.body &&
    top.title === title &&
    sameStateSpec(top.stateSpec, stateSpec);
  const versions = topIsCurrent
    ? history
    : [
        ...history,
        {
          version: (top?.version ?? 0) + 1,
          title,
          body: input.body,
          stateSpec,
          createdAt: updatedAt,
        },
      ];

  if (input.refs.length > ARTIFACT_REFS_MAX) userFacingError("Too many links");
  const refs = new Map<
    string,
    { kind: ArtifactRefKind; target: string; refKey: string }
  >();
  for (const ref of input.refs) {
    const target = checkRefTarget(ref.target);
    const refKey = `${ref.kind}:${target}`;
    refs.set(refKey, { kind: ref.kind, target, refKey });
  }

  if (input.state !== undefined) {
    const stateError = validateArtifactStateMap(input.state.data);
    if (stateError !== undefined) userFacingError(`state: ${stateError}`);
    checkTimestamp(input.state.updatedAt, "state updatedAt");
  }

  const bodies = new Set(versions.map((row) => row.body));
  let bytes = 0;
  for (const body of bodies) bytes += utf8ByteLength(body);

  return {
    input: { ...input, createdAt, updatedAt },
    title,
    description,
    stateSpec,
    origin,
    plainText,
    versions,
    refs: [...refs.values()],
    bytes,
  };
}

// the same checks as create; a failed check comes back as `error` (writes nothing)
export function checkImport(
  input: ImportArtifactInput,
): { ok: true; value: CheckedImport } | { ok: false; error: string } {
  try {
    return { ok: true, value: checkImportUnsafe(input) };
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") {
      return { ok: false, error: error.data };
    }
    throw error;
  }
}

// writes a checked import with its own timestamps. The caller checks
// idempotency (findByOrigin) first.
export async function insertImportedArtifact(
  ctx: MutationCtx,
  userId: Id<"users">,
  checked: CheckedImport,
): Promise<Id<"artifacts">> {
  const { input, title, description, stateSpec, origin, versions } = checked;
  const current = versions.at(-1);
  if (current === undefined) throw new Error("Import has no version");
  const currentBodyId = await putBody(
    ctx,
    undefined,
    userId,
    input.body,
    current.createdAt,
  );
  const id = await ctx.db.insert("artifacts", {
    userId,
    title,
    description,
    type: input.type,
    format: input.format,
    language: input.language,
    schemaVersion: input.schemaVersion,
    stateSpec,
    currentVersion: current.version,
    currentBodyId,
    size: utf8ByteLength(input.body),
    searchText: buildSearchText(title, description, checked.plainText),
    origin,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
  await ctx.db.patch(currentBodyId, { artifactId: id });
  for (const row of versions) {
    await ctx.db.insert("artifactVersions", {
      artifactId: id,
      userId,
      version: row.version,
      bodyId: await putBody(ctx, id, userId, row.body, row.createdAt),
      title: row.title,
      stateSpec: row.stateSpec,
      createdAt: row.createdAt,
      createdBy: origin.client,
    });
  }
  await pruneVersions(ctx, id, currentBodyId);
  for (const ref of checked.refs) {
    await ctx.db.insert("artifactRefs", {
      artifactId: id,
      userId,
      ...ref,
      createdAt: input.createdAt,
    });
  }
  if (input.state !== undefined) {
    const { data, updatedAt } = input.state;
    await ctx.db.insert("artifactState", {
      artifactId: id,
      userId,
      data,
      stateVersion: stateSpec?.stateVersion ?? 1,
      updatedAt,
      lastWriteAt: updatedAt,
      // imported state does not count against today's cap
      dailyWriteCount: 0,
      dailyWriteDay: utcDayKey(updatedAt),
    });
  }
  return id;
}

// ---- trash purge ----

// hard-deletes one artifact with its bodies, versions, state and refs, in
// bounded batches. Returns true once the artifact row itself is gone.
export async function deleteArtifactTree(
  ctx: MutationCtx,
  artifactId: Id<"artifacts">,
): Promise<boolean> {
  const batches = [
    await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact_version", (q) => q.eq("artifactId", artifactId))
      .take(PURGE_CHILD_BATCH),
    await ctx.db
      .query("artifactBodies")
      .withIndex("by_artifact", (q) => q.eq("artifactId", artifactId))
      .take(PURGE_BODY_BATCH),
    await ctx.db
      .query("artifactState")
      .withIndex("by_artifact_user", (q) => q.eq("artifactId", artifactId))
      .take(PURGE_CHILD_BATCH),
    await ctx.db
      .query("artifactRefs")
      .withIndex("by_artifact", (q) => q.eq("artifactId", artifactId))
      .take(PURGE_CHILD_BATCH),
  ];
  const limits = [
    PURGE_CHILD_BATCH,
    PURGE_BODY_BATCH,
    PURGE_CHILD_BATCH,
    PURGE_CHILD_BATCH,
  ];
  for (const batch of batches) {
    for (const child of batch) await ctx.db.delete(child._id);
  }
  // children may be left; the next batch deletes the artifact row
  if (batches.some((batch, i) => batch.length === limits[i])) return false;
  await ctx.db.delete(artifactId);
  return true;
}

// one batched step: hard-deletes artifacts trashed more than 30 days ago with
// their bodies, versions, state and refs. Returns true while work is left.
export async function purgeDeletedArtifactsBatch(
  ctx: MutationCtx,
  now: number,
): Promise<boolean> {
  const cutoff = now - ARTIFACT_TRASH_MS;
  const due = await ctx.db
    .query("artifacts")
    .withIndex("by_deleted", (q) =>
      q.gte("deletedAt", 0).lt("deletedAt", cutoff),
    )
    .take(PURGE_ARTIFACTS_BATCH);
  let more = due.length === PURGE_ARTIFACTS_BATCH;
  for (const doc of due) {
    if (!(await deleteArtifactTree(ctx, doc._id))) more = true;
  }
  return more;
}
