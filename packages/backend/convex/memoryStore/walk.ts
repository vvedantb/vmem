import type { MemoryWithTags } from "@vmem/sdk";
import { memoryMatchesListFilter } from "../../engine/memory/list";
import type { MemoryReadScope } from "../../engine/memory/scope";
import {
  addDashboardStatRow,
  type DashboardStatsAcc,
} from "../../engine/memory/dashboardStats";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import {
  SCOPED_MEMORY_PAGE_SIZE,
  type ListMemoryStoreParams,
  type MemoryListStoreResult,
} from "./helpers";

type RunQueryCtx = Pick<ActionCtx, "runQuery">;

const MAX_SCOPED_PAGES = 20_000;

type PageMeta = {
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string | null;
  pageStatus?: "SplitRecommended" | "SplitRequired" | null;
};

function scopeArgs(scope: MemoryReadScope): {
  kind: "personal" | "team";
  userId?: string;
  profileId?: string;
} {
  if (scope.kind === "team") {
    return { kind: "team", profileId: scope.profileId };
  }
  return {
    kind: "personal",
    userId: scope.userId,
    profileId: scope.profileId ?? undefined,
  };
}

async function walkPages<T>(
  load: (args: {
    cursor: string | null;
    numItems: number;
  }) => Promise<PageMeta & { items: T[] }>,
  onItems: (items: T[]) => boolean | void,
): Promise<void> {
  let cursor: string | null = null;
  let numItems = SCOPED_MEMORY_PAGE_SIZE;
  for (let i = 0; i < MAX_SCOPED_PAGES; i++) {
    const page = await load({ cursor, numItems });
    if (
      page.pageStatus === "SplitRequired" &&
      page.items.length === 0 &&
      numItems > 1
    ) {
      numItems = Math.max(1, Math.floor(numItems / 2));
      cursor = page.splitCursor ?? page.continueCursor;
      continue;
    }
    if (onItems(page.items) === false) return;
    if (page.isDone) return;
    cursor = page.continueCursor;
  }
  throw new Error("scoped memory pagination exceeded page budget");
}

export async function collectScopedMemoriesPaged(
  ctx: RunQueryCtx,
  scope: MemoryReadScope,
): Promise<MemoryWithTags[]> {
  const out: MemoryWithTags[] = [];
  await walkPages(
    async ({ cursor, numItems }) => {
      const page = await ctx.runQuery(
        internal.memoryStore.functions.paginateScopedMemoriesInternal,
        { ...scopeArgs(scope), cursor, numItems },
      );
      return { ...page, items: page.memories };
    },
    (items) => {
      out.push(...items);
    },
  );
  return out;
}

export async function listMemoriesPaged(
  ctx: RunQueryCtx,
  scope: MemoryReadScope,
  params: ListMemoryStoreParams & { countAll?: boolean },
): Promise<MemoryListStoreResult> {
  const start = Math.max(0, params.offset);
  const size = Math.max(0, params.limit);
  const memories: MemoryWithTags[] = [];
  let total = 0;
  let hasExtra = false;
  const countAll = params.countAll !== false;

  await walkPages(
    async ({ cursor, numItems }) => {
      const page = await ctx.runQuery(
        internal.memoryStore.functions.paginateScopedMemoriesInternal,
        { ...scopeArgs(scope), cursor, numItems },
      );
      return { ...page, items: page.memories };
    },
    (items) => {
      for (const memory of items) {
        if (!memoryMatchesListFilter(memory, params)) continue;
        if (countAll) {
          if (total >= start && memories.length < size) memories.push(memory);
          total += 1;
          continue;
        }
        if (memories.length >= size && total >= start + size) {
          hasExtra = true;
          return false;
        }
        if (total >= start && memories.length < size) memories.push(memory);
        total += 1;
      }
      return undefined;
    },
  );

  return {
    memories,
    total: countAll ? total : hasExtra ? start + memories.length + 1 : total,
  };
}

export async function foldScopedMemoryStats(
  ctx: RunQueryCtx,
  scope: MemoryReadScope,
  acc: DashboardStatsAcc,
): Promise<void> {
  await walkPages(
    async ({ cursor, numItems }) => {
      const page = await ctx.runQuery(
        internal.memoryStore.functions.paginateScopedMemoryStatsInternal,
        { ...scopeArgs(scope), cursor, numItems },
      );
      return { ...page, items: page.rows };
    },
    (items) => {
      for (const row of items) addDashboardStatRow(acc, row);
    },
  );
}
