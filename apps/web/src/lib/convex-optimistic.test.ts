import { describe, expect, it } from "vitest";
import type { OptimisticLocalStore } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { getFunctionName } from "convex/server";
import { api } from "@vmem/backend";
import {
  applyClearPollVotesOptimistic,
  applySendVoteOptimistic,
  applySetSlideOptimistic,
  applyTogglePollOptionOptimistic,
  insertMemoryInLists,
  patchMemoryInLists,
  removeMemoryFromLists,
} from "./convex-optimistic";

type QueryRef = FunctionReference<"query">;
type MemoryListPage = FunctionReturnType<typeof api.memoryApi.listMemories>;
type MemoryRow = MemoryListPage["memories"][number];
type PollSelections = FunctionReturnType<
  typeof api.presentations.getMyPollSelections
>;
type PollResults = FunctionReturnType<typeof api.presentations.pollResults>;
type SessionView = FunctionReturnType<typeof api.presentations.getSession>;

class FakeStore implements OptimisticLocalStore {
  private readonly tables = new Map<
    string,
    Array<{ args: unknown; value: unknown }>
  >();

  seed<Query extends QueryRef>(
    query: Query,
    args: FunctionArgs<Query>,
    value: FunctionReturnType<Query>,
  ): void {
    this.setQuery(query, args, value);
  }

  getQuery<Query extends QueryRef>(
    query: Query,
    args: FunctionArgs<Query>,
  ): FunctionReturnType<Query> | undefined {
    const needle = JSON.stringify(args);
    const rows = this.tables.get(getFunctionName(query));
    const match = rows?.find((row) => JSON.stringify(row.args) === needle);
    if (match === undefined) return undefined;
    return match.value;
  }

  setQuery<Query extends QueryRef>(
    query: Query,
    args: FunctionArgs<Query>,
    value: FunctionReturnType<Query>,
  ): void {
    const name = getFunctionName(query);
    const needle = JSON.stringify(args);
    const rows = this.tables.get(name) ?? [];
    const next = rows.filter((row) => JSON.stringify(row.args) !== needle);
    next.push({ args, value });
    this.tables.set(name, next);
  }

  getAllQueries<Query extends QueryRef>(
    query: Query,
  ): Array<{ args: FunctionArgs<Query>; value: FunctionReturnType<Query> }> {
    const rows = this.tables.get(getFunctionName(query)) ?? [];
    return rows.map((row) => ({
      args: row.args,
      value: row.value,
    }));
  }
}

const page0 = {
  profileId: "profile_a",
  limit: 100,
  offset: 0,
};
const page1 = {
  profileId: "profile_a",
  limit: 100,
  offset: 100,
};

function memoryRow(id: string, title: string): MemoryRow {
  return {
    id,
    userId: "clerk_a",
    profileId: "profile_a",
    title,
    content: `${title} body`,
    type: "knowledge",
    source: "web",
    sourceType: "web",
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: 1,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    tags: ["tooling"],
  };
}

describe("memory list optimistic updates", () => {
  it("inserts onto offset-0 pages and bumps total on later pages", () => {
    const store = new FakeStore();
    store.seed(api.memoryApi.listMemories, page0, {
      memories: [memoryRow("old", "Old")],
      total: 101,
    });
    store.seed(api.memoryApi.listMemories, page1, {
      memories: [memoryRow("later", "Later")],
      total: 101,
    });

    insertMemoryInLists(store, {
      title: "New",
      content: "New body",
      type: "knowledge",
      source: "web",
      tags: ["tooling"],
      confidence: 1,
      profileId: "profile_a",
    });

    const first = store.getQuery(api.memoryApi.listMemories, page0);
    const second = store.getQuery(api.memoryApi.listMemories, page1);
    expect(first?.memories[0]?.title).toBe("New");
    expect(first?.total).toBe(102);
    expect(second?.memories.map((row) => row.title)).toEqual(["Later"]);
    expect(second?.total).toBe(102);
  });

  it("patches matching rows and drops rows that no longer match filters", () => {
    const store = new FakeStore();
    const filtered = { ...page0, type: "knowledge" };
    store.seed(api.memoryApi.listMemories, filtered, {
      memories: [memoryRow("m1", "Keep type")],
      total: 1,
    });
    store.seed(
      api.memoryApi.getMemory,
      { memoryId: "m1", profileId: "profile_a" },
      memoryRow("m1", "Keep type"),
    );

    patchMemoryInLists(store, {
      memoryId: "m1",
      title: "Renamed",
      type: "episodic",
    });

    const list = store.getQuery(api.memoryApi.listMemories, filtered);
    expect(list?.memories).toEqual([]);
    expect(list?.total).toBe(0);
    const detail = store.getQuery(api.memoryApi.getMemory, {
      memoryId: "m1",
      profileId: "profile_a",
    });
    expect(detail?.title).toBe("Renamed");
    expect(detail?.type).toBe("episodic");
  });

  it("removes a memory from list pages and getMemory", () => {
    const store = new FakeStore();
    store.seed(api.memoryApi.listMemories, page0, {
      memories: [memoryRow("m1", "Gone"), memoryRow("m2", "Stay")],
      total: 2,
    });
    store.seed(
      api.memoryApi.getMemory,
      { memoryId: "m1" },
      memoryRow("m1", "Gone"),
    );

    removeMemoryFromLists(store, "m1");

    const list = store.getQuery(api.memoryApi.listMemories, page0);
    expect(list?.memories.map((row) => row.id)).toEqual(["m2"]);
    expect(list?.total).toBe(1);
    expect(store.getQuery(api.memoryApi.getMemory, { memoryId: "m1" })).toBe(
      null,
    );
  });
});

describe("presentation poll optimistic updates", () => {
  it("replaces a single-choice vote and retallies results", () => {
    const store = new FakeStore();
    const selectionArgs = {
      code: "abc123f",
      pollId: "poll-1",
      participantKey: "p1",
    };
    const previous: PollSelections = ["a"];
    const results: PollResults = {
      options: [
        { optionId: "a", count: 1 },
        { optionId: "b", count: 2 },
      ],
      total: 3,
    };
    store.seed(api.presentations.getMyPollSelections, selectionArgs, previous);
    store.seed(
      api.presentations.pollResults,
      { code: "abc123f", pollId: "poll-1" },
      results,
    );

    applySendVoteOptimistic(store, {
      code: "abc123f",
      pollId: "poll-1",
      participantKey: "p1",
      optionId: "b",
    });

    expect(
      store.getQuery(api.presentations.getMyPollSelections, selectionArgs),
    ).toEqual(["b"]);
    expect(
      store.getQuery(api.presentations.pollResults, {
        code: "abc123f",
        pollId: "poll-1",
      }),
    ).toEqual({
      options: [{ optionId: "b", count: 3 }],
      total: 3,
    });
  });

  it("toggles a multi-select option on and off", () => {
    const store = new FakeStore();
    const selectionArgs = {
      code: "abc123f",
      pollId: "poll-2",
      participantKey: "p1",
    };
    store.seed(api.presentations.getMyPollSelections, selectionArgs, ["a"]);
    store.seed(
      api.presentations.pollResults,
      { code: "abc123f", pollId: "poll-2" },
      {
        options: [{ optionId: "a", count: 1 }],
        total: 1,
      },
    );

    applyTogglePollOptionOptimistic(store, {
      code: "abc123f",
      pollId: "poll-2",
      participantKey: "p1",
      optionId: "b",
    });
    expect(
      store.getQuery(api.presentations.getMyPollSelections, selectionArgs),
    ).toEqual(["a", "b"]);

    applyTogglePollOptionOptimistic(store, {
      code: "abc123f",
      pollId: "poll-2",
      participantKey: "p1",
      optionId: "a",
    });
    expect(
      store.getQuery(api.presentations.getMyPollSelections, selectionArgs),
    ).toEqual(["b"]);
    expect(
      store.getQuery(api.presentations.pollResults, {
        code: "abc123f",
        pollId: "poll-2",
      }),
    ).toEqual({
      options: [{ optionId: "b", count: 1 }],
      total: 1,
    });
  });

  it("clears poll results and every cached participant selection", () => {
    const store = new FakeStore();
    store.seed(
      api.presentations.pollResults,
      { code: "abc123f", pollId: "poll-3" },
      { options: [{ optionId: "a", count: 2 }], total: 2 },
    );
    store.seed(
      api.presentations.getMyPollSelections,
      { code: "abc123f", pollId: "poll-3", participantKey: "p1" },
      ["a"],
    );
    store.seed(
      api.presentations.getMyPollSelections,
      { code: "abc123f", pollId: "poll-3", participantKey: "p2" },
      ["a"],
    );

    applyClearPollVotesOptimistic(store, {
      code: "abc123f",
      hostKey: "host",
      pollId: "poll-3",
    });

    expect(
      store.getQuery(api.presentations.pollResults, {
        code: "abc123f",
        pollId: "poll-3",
      }),
    ).toEqual({ options: [], total: 0 });
    expect(
      store.getQuery(api.presentations.getMyPollSelections, {
        code: "abc123f",
        pollId: "poll-3",
        participantKey: "p1",
      }),
    ).toEqual([]);
  });
});

describe("presentation slide optimistic updates", () => {
  it("patches the live session slide", () => {
    const store = new FakeStore();
    const live: SessionView = { slide: 1, status: "live" };
    store.seed(api.presentations.getSession, { code: "abc123f" }, live);
    applySetSlideOptimistic(store, {
      code: "abc123f",
      hostKey: "host",
      slide: 4,
    });
    expect(
      store.getQuery(api.presentations.getSession, { code: "abc123f" }),
    ).toEqual({ slide: 4, status: "live" });
  });
});
