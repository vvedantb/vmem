"use node";

import type { MemoryStatus, MemoryType, MemoryWithTags } from "@vmem/sdk";
import { computeContentHash } from "../../../engine/memory/hash";
import { runBestEffort } from "../../../engine/memory/bestEffort";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";

export type DualWriteCtx = Pick<ActionCtx, "runMutation">;

export interface DualWriteCreateExtras {
  url?: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
  fallbackProfileId?: string;
}

export interface DualWriteUpdateArgs {
  userId: string;
  memoryId: string;
  title?: string;
  content?: string;
  type?: MemoryType;
  status?: MemoryStatus;
  tags?: string[];
  confidence?: number;
  expiresAt?: string | null;
}

function optionalString(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return value;
}

function warnDualWrite(label: string, error: unknown): void {
  console.warn(`[memoryStore dual-write] ${label} failed`, error);
}

export async function dualWriteCreate(
  ctx: DualWriteCtx,
  memory: MemoryWithTags,
  extras?: DualWriteCreateExtras,
): Promise<void> {
  const profileId = memory.profileId ?? extras?.fallbackProfileId;
  if (profileId === undefined) {
    console.warn(
      `[memoryStore dual-write] create skipped: missing profileId memoryId=${memory.id}`,
    );
    return;
  }

  await runBestEffort(
    () =>
      ctx.runMutation(internal.memoryStore.functions.createMemoryInternal, {
        memoryId: memory.id,
        userId: memory.userId,
        profileId,
        title: memory.title,
        content: memory.content,
        type: memory.type,
        source: memory.source,
        tags: memory.tags,
        confidence: memory.confidence,
        contentHash: computeContentHash(memory.title, memory.content),
        expiresAt: optionalString(memory.expiresAt),
        url: extras?.url,
        sourceType: optionalString(memory.sourceType),
        sourceId: optionalString(memory.sourceId),
        sourceUrl: optionalString(memory.sourceUrl),
        sourceSyncedAt: optionalString(memory.sourceSyncedAt),
        storageId: extras?.storageId,
        mimeType: extras?.mimeType,
        originalFilename: extras?.originalFilename,
      }),
    (error) => warnDualWrite(`create ${memory.id}`, error),
  );
}

export async function dualWriteUpdate(
  ctx: DualWriteCtx,
  args: DualWriteUpdateArgs,
): Promise<void> {
  await runBestEffort(
    () =>
      ctx.runMutation(internal.memoryStore.functions.updateMemoryInternal, {
        userId: args.userId,
        memoryId: args.memoryId,
        title: args.title,
        content: args.content,
        type: args.type,
        status: args.status,
        tags: args.tags,
        confidence: args.confidence,
        expiresAt: args.expiresAt,
      }),
    (error) => warnDualWrite(`update ${args.memoryId}`, error),
  );
}

export async function dualWriteDelete(
  ctx: DualWriteCtx,
  userId: string,
  memoryId: string,
): Promise<void> {
  await runBestEffort(
    () =>
      ctx.runMutation(internal.memoryStore.functions.deleteMemoryInternal, {
        userId,
        memoryId,
      }),
    (error) => warnDualWrite(`delete ${memoryId}`, error),
  );
}

export async function dualWriteDeleteTeamAsOwner(
  ctx: DualWriteCtx,
  profileId: string,
  memoryId: string,
): Promise<void> {
  await runBestEffort(
    () =>
      ctx.runMutation(
        internal.memoryStore.functions.deleteTeamMemoryAsOwnerInternal,
        { profileId, memoryId },
      ),
    (error) => warnDualWrite(`team-delete ${memoryId}`, error),
  );
}

export async function dualWriteDeleteAllForUser(
  ctx: DualWriteCtx,
  userId: string,
): Promise<void> {
  await runBestEffort(
    () =>
      ctx.runMutation(
        internal.memoryStore.functions.deleteMemoriesForUserInternal,
        { userId },
      ),
    (error) => warnDualWrite(`delete-all ${userId}`, error),
  );
}
