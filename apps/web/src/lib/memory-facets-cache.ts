import type { QueryClient } from "@tanstack/react-query";
import type { MemorySummary } from "@/lib/memories";

// queryKey root shared by useMemoryFacets and the write paths
export const MEMORY_FACETS_KEY = "memory-facets";
const FACETS_REFETCH_DEBOUNCE_MS = 1500;

type SummaryPatch = Partial<
  Pick<MemorySummary, "title" | "tags" | "type" | "status">
>;

function updateFacets(
  queryClient: QueryClient,
  update: (rows: MemorySummary[]) => MemorySummary[],
): void {
  queryClient.setQueriesData<MemorySummary[]>(
    { queryKey: [MEMORY_FACETS_KEY] },
    (rows) => (rows === undefined ? rows : update(rows)),
  );
}

export function addMemoryToFacets(
  queryClient: QueryClient,
  row: MemorySummary,
): void {
  updateFacets(queryClient, (rows) =>
    rows.some((r) => r.id === row.id) ? rows : [row, ...rows],
  );
}

export function patchMemoryInFacets(
  queryClient: QueryClient,
  memoryId: string,
  patch: SummaryPatch,
): void {
  updateFacets(queryClient, (rows) =>
    rows.map((r) =>
      r.id === memoryId
        ? {
            ...r,
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
            ...(patch.type !== undefined ? { type: patch.type } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
          }
        : r,
    ),
  );
}

export function removeMemoryFromFacets(
  queryClient: QueryClient,
  memoryId: string,
): void {
  updateFacets(queryClient, (rows) => rows.filter((r) => r.id !== memoryId));
}

let refetchTimer: ReturnType<typeof setTimeout> | undefined;

// Trailing debounce: a burst of writes (bulk tag rename) costs one scope walk,
// and only for facets that are currently mounted.
export function scheduleFacetsRefetch(queryClient: QueryClient): void {
  if (refetchTimer !== undefined) clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => {
    refetchTimer = undefined;
    void queryClient.invalidateQueries({
      queryKey: [MEMORY_FACETS_KEY],
      refetchType: "active",
    });
  }, FACETS_REFETCH_DEBOUNCE_MS);
}
