import { afterEach, describe, expect, it, vi } from "vitest";
import type { OptimisticLocalStore } from "convex/browser";
import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";
import { api } from "@vmem/backend";
import {
  insertMemoryInLists,
  patchMemoryInLists,
  removeMemoryFromLists,
  tempId,
  updateAllCachedQueries,
} from "./convex-optimistic";

type QueryRef = FunctionReference<"query">;
type CachedQuery = ReturnType<OptimisticLocalStore["getAllQueries"]>[number];
type QuerySeed = {
  query: QueryRef;
  args: CachedQuery["args"];
  value: CachedQuery["value"];
};

function createStore(seed: QuerySeed[]): OptimisticLocalStore {
  const byQuery = new Map<string, Map<string, CachedQuery>>();
  const argsKey = (args: CachedQuery["args"]) => JSON.stringify(args);
  const bucket = (query: QueryRef) => {
    const path = getFunctionName(query);
    const inner = byQuery.get(path) ?? new Map<string, CachedQuery>();
    byQuery.set(path, inner);
    return inner;
  };
  for (const entry of seed) {
    bucket(entry.query).set(argsKey(entry.args), {
      args: entry.args,
      value: entry.value,
    });
  }
  return {
    getQuery(query, args) {
      return bucket(query).get(argsKey(args))?.value;
    },
    setQuery(query, args, value) {
      bucket(query).set(argsKey(args), { args, value });
    },
    getAllQueries(query) {
      return [...bucket(query).values()];
    },
  };
}

const sampleMemory = {
  id: "mem-1",
  userId: "user_1",
  profileId: "profile-1",
  title: "Alpha",
  content: "hello world",
  type: "knowledge" as const,
  source: "web",
  sourceType: "web",
  sourceId: null,
  sourceUrl: null,
  sourceSyncedAt: null,
  confidence: 1,
  status: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  eventStart: null,
  eventEnd: null,
  temporalKind: null,
  tags: ["keep"],
};

const sampleSummary = {
  id: "mem-1",
  title: "Alpha",
  preview: "hello world",
  type: "knowledge" as const,
  status: "active" as const,
  source: "web",
  sourceUrl: null,
  sourceSyncedAt: null,
  tags: ["keep"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  profileId: "profile-1",
};

function summaryPage(
  page: (typeof sampleSummary)[],
): FunctionReturnType<typeof api.memoryApi.listSummaries> {
  return { page, isDone: false, continueCursor: "c1" };
}

describe("memory list optimistic updates", () => {
  const firstPageArgs = {
    profileId: "profile-1",
    paginationOpts: { numItems: 40, cursor: null },
  };
  const secondPageArgs = {
    profileId: "profile-1",
    paginationOpts: { numItems: 40, cursor: "c1" },
  };
  const secondRow = { ...sampleSummary, id: "mem-2", title: "Beta" };
  const newMemory = {
    title: "New",
    content: "body",
    type: "knowledge" as const,
    source: "web",
    tags: [] as string[],
    confidence: 1,
    profileId: "profile-1",
  };

  it("inserts a matching memory at the head of the first page only", () => {
    const store = createStore([
      {
        query: api.memoryApi.listSummaries,
        args: firstPageArgs,
        value: summaryPage([sampleSummary]),
      },
      {
        query: api.memoryApi.listSummaries,
        args: secondPageArgs,
        value: summaryPage([secondRow]),
      },
    ]);
    insertMemoryInLists(store, newMemory);
    const first = store.getQuery(api.memoryApi.listSummaries, firstPageArgs);
    expect(first?.page.map((r) => r.title)).toEqual(["New", "Alpha"]);
    expect(first?.page[0]?.preview).toBe("body");
    const second = store.getQuery(api.memoryApi.listSummaries, secondPageArgs);
    expect(second?.page).toHaveLength(1);
  });

  it("skips lists whose filters the new memory does not match", () => {
    const tagged = { ...firstPageArgs, tags: ["other"] };
    const searched = { ...firstPageArgs, searchQuery: "zzz" };
    const otherProfile = { ...firstPageArgs, profileId: "profile-2" };
    const store = createStore([
      {
        query: api.memoryApi.listSummaries,
        args: tagged,
        value: summaryPage([]),
      },
      {
        query: api.memoryApi.listSummaries,
        args: searched,
        value: summaryPage([]),
      },
      {
        query: api.memoryApi.listSummaries,
        args: otherProfile,
        value: summaryPage([]),
      },
    ]);
    insertMemoryInLists(store, newMemory);
    for (const args of [tagged, searched, otherProfile]) {
      expect(
        store.getQuery(api.memoryApi.listSummaries, args)?.page,
      ).toHaveLength(0);
    }
  });

  it("patches title and tags on any loaded page and on get", () => {
    const fullRow = { ...sampleMemory };
    const store = createStore([
      {
        query: api.memoryApi.listSummaries,
        args: secondPageArgs,
        value: summaryPage([secondRow, sampleSummary]),
      },
      {
        query: api.memoryApi.get,
        args: { memoryId: "mem-1", profileId: "profile-1" },
        value: fullRow,
      },
    ]);
    patchMemoryInLists(store, {
      memoryId: "mem-1",
      title: "Renamed",
      content: "new   body",
      tags: ["keep", "extra"],
      profileId: "profile-1",
    });
    const page = store.getQuery(api.memoryApi.listSummaries, secondPageArgs);
    expect(page?.page[1]).toMatchObject({
      title: "Renamed",
      preview: "new body",
      tags: ["keep", "extra"],
    });
    expect(page?.page[0]?.title).toBe("Beta");
    expect(
      store.getQuery(api.memoryApi.get, {
        memoryId: "mem-1",
        profileId: "profile-1",
      }),
    ).toMatchObject({ title: "Renamed", content: "new   body" });
  });

  it("drops an edited row out of a tag-filtered list", () => {
    const tagged = { ...firstPageArgs, tags: ["keep"] };
    const store = createStore([
      {
        query: api.memoryApi.listSummaries,
        args: tagged,
        value: summaryPage([sampleSummary]),
      },
    ]);
    patchMemoryInLists(store, { memoryId: "mem-1", tags: ["other"] });
    expect(store.getQuery(api.memoryApi.listSummaries, tagged)?.page).toEqual(
      [],
    );
  });

  it("removes a memory from every page and from get", () => {
    const store = createStore([
      {
        query: api.memoryApi.listSummaries,
        args: firstPageArgs,
        value: summaryPage([sampleSummary]),
      },
      {
        query: api.memoryApi.listSummaries,
        args: secondPageArgs,
        value: summaryPage([secondRow]),
      },
      {
        query: api.memoryApi.get,
        args: { memoryId: "mem-1" },
        value: sampleMemory,
      },
    ]);
    removeMemoryFromLists(store, "mem-1");
    expect(
      store.getQuery(api.memoryApi.listSummaries, firstPageArgs)?.page,
    ).toEqual([]);
    expect(
      store.getQuery(api.memoryApi.listSummaries, secondPageArgs)?.page,
    ).toHaveLength(1);
    expect(store.getQuery(api.memoryApi.get, { memoryId: "mem-1" })).toBeNull();
  });
});

describe("tempId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a v4 uuid string", () => {
    const id = tempId<"skills">();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(tempId<"skills">()).not.toBe(id);
  });

  it("returns crypto.randomUUID() unchanged", () => {
    const spy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000000");
    expect(tempId<"users">()).toBe("00000000-0000-4000-8000-000000000000");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("updateAllCachedQueries", () => {
  it("maps every loaded entry's value and skips loading ones", () => {
    const loadedA = { memoryId: "mem-a" };
    const loadedB = { memoryId: "mem-b" };
    const loading = { memoryId: "mem-c" };
    const store = createStore([
      { query: api.memoryApi.get, args: loadedA, value: { title: "a" } },
      { query: api.memoryApi.get, args: loadedB, value: { title: "b" } },
      { query: api.memoryApi.get, args: loading, value: undefined },
    ]);
    const seen: (string | undefined)[] = [];
    updateAllCachedQueries(store, api.memoryApi.get, (row) => {
      seen.push(row?.title);
      return null;
    });
    expect(seen).toEqual(["a", "b"]);
    expect(store.getQuery(api.memoryApi.get, loadedA)).toBeNull();
    expect(store.getQuery(api.memoryApi.get, loadedB)).toBeNull();
    expect(store.getQuery(api.memoryApi.get, loading)).toBeUndefined();
    expect(store.getAllQueries(api.memoryApi.get)).toHaveLength(3);
  });
});
