import type { MemoryWithTags } from "@vmem/sdk";
import type { MemoryReadScope } from "../../engine/memory/scope";
import {
  addDashboardStatRow,
  type DashboardStatsAcc,
} from "../../engine/memory/dashboardStats";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { MemorySummary } from "./mappers";
import { SCOPED_MEMORY_PAGE_SIZE } from "./helpers";

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

export async function walkPages<T>(
  load: (args: {
    cursor: string | null;
    numItems: number;
  }) => Promise<PageMeta & { items: T[] }>,
  onItems: (items: T[]) => boolean | void,
  pageSize: number = SCOPED_MEMORY_PAGE_SIZE,
): Promise<void> {
  let cursor: string | null = null;
  let numItems = pageSize;
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

const SUMMARY_WALK_PAGE_SIZE = 200;

// cap for one full-scope summary walk (facets, timeline, bulk tag edits)
export const MAX_SCOPE_SUMMARIES = 10_000;

// Every matching slim summary in scope (newest first), capped at `max`. Meant
// for on-demand, non-reactive reads: the cost is one scope walk per call.
export async function listMemorySummariesPaged(
  ctx: RunQueryCtx,
  scope: MemoryReadScope,
  filter: {
    type?: string;
    source?: string;
    tags?: string[];
    searchQuery?: string;
  },
  max: number,
): Promise<{ rows: MemorySummary[]; truncated: boolean }> {
  const rows: MemorySummary[] = [];
  let truncated = false;
  await walkPages(
    async ({ cursor, numItems }) => {
      const page = await ctx.runQuery(
        internal.memoryStore.functions.paginateScopedMemorySummariesInternal,
        { ...scopeArgs(scope), ...filter, cursor, numItems },
      );
      return { ...page, items: page.rows };
    },
    (items) => {
      for (const row of items) {
        if (rows.length >= max) {
          truncated = true;
          return false;
        }
        rows.push(row);
      }
      return undefined;
    },
    SUMMARY_WALK_PAGE_SIZE,
  );
  return { rows, truncated };
}
