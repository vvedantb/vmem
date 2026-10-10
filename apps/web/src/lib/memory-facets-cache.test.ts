import { describe, expect, it, vi, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { MemorySummary } from "@/lib/memories";
import {
  addMemoryToFacets,
  MEMORY_FACETS_KEY,
  patchMemoryInFacets,
  removeMemoryFromFacets,
  scheduleFacetsRefetch,
} from "./memory-facets-cache";

function row(id: string, tags: string[] = []): MemorySummary {
  return {
    id,
    title: `T ${id}`,
    preview: "",
    type: "knowledge",
    status: "active",
    source: "web",
    sourceUrl: null,
    sourceSyncedAt: null,
    tags,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    profileId: "p1",
  };
}

function seeded() {
  const client = new QueryClient();
  client.setQueryData([MEMORY_FACETS_KEY, "p1"], [row("a", ["x"]), row("b")]);
  return client;
}

const rowsOf = (client: QueryClient) =>
  client.getQueryData<MemorySummary[]>([MEMORY_FACETS_KEY, "p1"]);

afterEach(() => {
  vi.useRealTimers();
});

describe("memory facets cache", () => {
  it("adds, patches and removes rows in every cached facets query", () => {
    const client = seeded();
    addMemoryToFacets(client, row("c", ["new"]));
    expect(rowsOf(client)?.map((r) => r.id)).toEqual(["c", "a", "b"]);
    // adding twice is a no-op
    addMemoryToFacets(client, row("c"));
    expect(rowsOf(client)).toHaveLength(3);

    patchMemoryInFacets(client, "a", { tags: ["y", "z"], title: "Renamed" });
    expect(rowsOf(client)?.find((r) => r.id === "a")).toMatchObject({
      tags: ["y", "z"],
      title: "Renamed",
    });

    removeMemoryFromFacets(client, "b");
    expect(rowsOf(client)?.map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("leaves unfetched facets untouched", () => {
    const client = new QueryClient();
    addMemoryToFacets(client, row("a"));
    expect(client.getQueryData([MEMORY_FACETS_KEY, "p1"])).toBeUndefined();
  });

  it("coalesces a burst of writes into one trailing refetch", () => {
    vi.useFakeTimers();
    const client = seeded();
    const spy = vi.spyOn(client, "invalidateQueries");
    for (let i = 0; i < 25; i += 1) scheduleFacetsRefetch(client);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      queryKey: [MEMORY_FACETS_KEY],
      refetchType: "active",
    });
  });
});
