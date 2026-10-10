import { describe, expect, it } from "vitest";
import type { OptimisticLocalStore } from "convex/browser";
import { getFunctionName, type FunctionReference } from "convex/server";
import { api } from "@vmem/backend";
import {
  applyClearPollVotesOptimistic,
  applySendVoteOptimistic,
  applySetSlideOptimistic,
  applyStopSharingOptimistic,
  applyTogglePollOptionOptimistic,
  insertMemoryInLists,
  patchMemoryInLists,
  removeMemoryFromLists,
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

describe("memory list optimistic updates", () => {
  const listArgs = {
    profileId: "profile-1",
    limit: 100,
    offset: 0,
  };

  it("inserts a matching memory at offset 0 and bumps total", () => {
    const store = createStore([
      {
        query: api.memoryApi.list,
        args: listArgs,
        value: { memories: [sampleMemory], total: 1 },
      },
    ]);
    insertMemoryInLists(store, {
      title: "New",
      content: "body",
      type: "knowledge",
      source: "web",
      tags: [],
      confidence: 1,
      profileId: "profile-1",
    });
    const page = store.getQuery(api.memoryApi.list, listArgs);
    expect(page?.total).toBe(2);
    expect(page?.memories).toHaveLength(2);
    expect(page?.memories[0]?.title).toBe("New");
  });

  it("patches title on list and get queries", () => {
    const store = createStore([
      {
        query: api.memoryApi.list,
        args: listArgs,
        value: { memories: [sampleMemory], total: 1 },
      },
      {
        query: api.memoryApi.get,
        args: { memoryId: "mem-1", profileId: "profile-1" },
        value: sampleMemory,
      },
    ]);
    patchMemoryInLists(store, {
      memoryId: "mem-1",
      title: "Renamed",
      profileId: "profile-1",
    });
    expect(
      store.getQuery(api.memoryApi.list, listArgs)?.memories[0]?.title,
    ).toBe("Renamed");
    expect(
      store.getQuery(api.memoryApi.get, {
        memoryId: "mem-1",
        profileId: "profile-1",
      })?.title,
    ).toBe("Renamed");
  });

  it("removes a memory from list and get", () => {
    const store = createStore([
      {
        query: api.memoryApi.list,
        args: listArgs,
        value: { memories: [sampleMemory], total: 1 },
      },
      {
        query: api.memoryApi.get,
        args: { memoryId: "mem-1" },
        value: sampleMemory,
      },
    ]);
    removeMemoryFromLists(store, "mem-1");
    expect(store.getQuery(api.memoryApi.list, listArgs)).toEqual({
      memories: [],
      total: 0,
    });
    expect(store.getQuery(api.memoryApi.get, { memoryId: "mem-1" })).toBeNull();
  });
});

describe("slide poll optimistic updates", () => {
  const resultsArgs = { code: "abc1234", pollId: "p1" };
  const myArgs = {
    code: "abc1234",
    pollId: "p1",
    participantKey: "viewer",
  };

  it("records a first single-choice vote", () => {
    const store = createStore([
      {
        query: api.presentations.pollResults,
        args: resultsArgs,
        value: { options: [], total: 0 },
      },
      {
        query: api.presentations.getMyPollSelections,
        args: myArgs,
        value: [],
      },
    ]);
    applySendVoteOptimistic(store, {
      code: "abc1234",
      pollId: "p1",
      participantKey: "viewer",
      optionId: "yes",
    });
    expect(
      store.getQuery(api.presentations.getMyPollSelections, myArgs),
    ).toEqual(["yes"]);
    expect(store.getQuery(api.presentations.pollResults, resultsArgs)).toEqual({
      options: [{ optionId: "yes", count: 1 }],
      total: 1,
    });
  });

  it("toggles a multi-select option off", () => {
    const store = createStore([
      {
        query: api.presentations.pollResults,
        args: resultsArgs,
        value: { options: [{ optionId: "a", count: 1 }], total: 1 },
      },
      {
        query: api.presentations.getMyPollSelections,
        args: myArgs,
        value: ["a"],
      },
    ]);
    applyTogglePollOptionOptimistic(store, {
      code: "abc1234",
      pollId: "p1",
      participantKey: "viewer",
      optionId: "a",
    });
    expect(
      store.getQuery(api.presentations.getMyPollSelections, myArgs),
    ).toEqual([]);
    expect(store.getQuery(api.presentations.pollResults, resultsArgs)).toEqual({
      options: [],
      total: 0,
    });
  });

  it("clears poll votes", () => {
    const store = createStore([
      {
        query: api.presentations.pollResults,
        args: resultsArgs,
        value: { options: [{ optionId: "a", count: 2 }], total: 2 },
      },
      {
        query: api.presentations.getMyPollSelections,
        args: myArgs,
        value: ["a"],
      },
    ]);
    applyClearPollVotesOptimistic(store, {
      code: "abc1234",
      hostKey: "host",
      pollId: "p1",
    });
    expect(store.getQuery(api.presentations.pollResults, resultsArgs)).toEqual({
      options: [],
      total: 0,
    });
    expect(
      store.getQuery(api.presentations.getMyPollSelections, myArgs),
    ).toEqual([]);
  });

  it("patches the live session slide and end state", () => {
    const sessionArgs = { code: "abc1234" };
    const store = createStore([
      {
        query: api.presentations.getSession,
        args: sessionArgs,
        value: { slide: 1, status: "live" },
      },
    ]);
    applySetSlideOptimistic(store, {
      code: "abc1234",
      hostKey: "host",
      slide: 4,
    });
    expect(
      store.getQuery(api.presentations.getSession, sessionArgs)?.slide,
    ).toBe(4);
    applyStopSharingOptimistic(store, { code: "abc1234", hostKey: "host" });
    expect(
      store.getQuery(api.presentations.getSession, sessionArgs)?.status,
    ).toBe("ended");
  });
});
