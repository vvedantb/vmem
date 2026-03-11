import { describe, it, expect, vi, beforeEach } from "vitest";
import { memories } from "../memories";

// Mock the neo4j module
vi.mock("../../db/neo4j", () => ({
  getDriver: vi.fn(() => ({})),
}));

// Mock MemoryService
const mockService = {
  createMemory: vi.fn(),
  listMemories: vi.fn(),
  getMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  searchMemories: vi.fn(),
  retrieveMemories: vi.fn(),
  getMemoryEvents: vi.fn(),
};

vi.mock("../../db/memory-service", () => ({
  MemoryService: vi.fn(() => mockService),
}));

function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): Request {
  const url = new URL(`http://localhost${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url.toString(), {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /", () => {
  it("returns 400 on invalid body", async () => {
    const res = await memories.fetch(makeRequest("POST", "/", { userId: "" }));
    expect(res.status).toBe(400);
  });

  it("creates a memory and returns 201", async () => {
    const memory = { id: "1", userId: "u1", title: "Test" };
    mockService.createMemory.mockResolvedValue(memory);

    const res = await memories.fetch(
      makeRequest("POST", "/", {
        userId: "u1",
        title: "Test",
        content: "Content",
        type: "episodic",
        source: "test",
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual(memory);
  });

  it("returns 500 on service error", async () => {
    mockService.createMemory.mockRejectedValue(new Error("DB error"));
    const res = await memories.fetch(
      makeRequest("POST", "/", {
        userId: "u1",
        title: "Test",
        content: "Content",
        type: "episodic",
        source: "test",
      }),
    );
    expect(res.status).toBe(500);
  });
});

describe("GET /", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await memories.fetch(makeRequest("GET", "/"));
    expect(res.status).toBe(400);
  });

  it("returns memory list", async () => {
    mockService.listMemories.mockResolvedValue({ memories: [], total: 0 });
    const res = await memories.fetch(
      makeRequest("GET", "/", undefined, { userId: "u1" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ memories: [], total: 0 });
  });

  it("returns 500 on service error", async () => {
    mockService.listMemories.mockRejectedValue(new Error("DB error"));
    const res = await memories.fetch(
      makeRequest("GET", "/", undefined, { userId: "u1" }),
    );
    expect(res.status).toBe(500);
  });
});

describe("GET /:id", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await memories.fetch(makeRequest("GET", "/mem-1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when memory not found", async () => {
    mockService.getMemory.mockResolvedValue(null);
    const res = await memories.fetch(
      makeRequest("GET", "/mem-1", undefined, { userId: "u1" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns memory", async () => {
    const memory = { id: "mem-1", title: "Test" };
    mockService.getMemory.mockResolvedValue(memory);
    const res = await memories.fetch(
      makeRequest("GET", "/mem-1", undefined, { userId: "u1" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(memory);
  });
});

describe("PATCH /:id", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await memories.fetch(
      makeRequest("PATCH", "/mem-1", { title: "New" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when memory not found", async () => {
    mockService.updateMemory.mockResolvedValue(null);
    const res = await memories.fetch(
      makeRequest("PATCH", "/mem-1", { title: "New" }, { userId: "u1" }),
    );
    expect(res.status).toBe(404);
  });

  it("updates memory", async () => {
    const memory = { id: "mem-1", title: "New" };
    mockService.updateMemory.mockResolvedValue(memory);
    const res = await memories.fetch(
      makeRequest("PATCH", "/mem-1", { title: "New" }, { userId: "u1" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(memory);
  });
});

describe("DELETE /:id", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await memories.fetch(makeRequest("DELETE", "/mem-1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when memory not found", async () => {
    mockService.deleteMemory.mockResolvedValue(false);
    const res = await memories.fetch(
      makeRequest("DELETE", "/mem-1", undefined, { userId: "u1" }),
    );
    expect(res.status).toBe(404);
  });

  it("deletes memory", async () => {
    mockService.deleteMemory.mockResolvedValue(true);
    const res = await memories.fetch(
      makeRequest("DELETE", "/mem-1", undefined, { userId: "u1" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "deleted" });
  });
});

describe("POST /search", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await memories.fetch(makeRequest("POST", "/search", {}));
    expect(res.status).toBe(400);
  });

  it("returns search results", async () => {
    mockService.searchMemories.mockResolvedValue({ memories: [], total: 0 });
    const res = await memories.fetch(
      makeRequest("POST", "/search", { userId: "u1" }),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /retrieve", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await memories.fetch(
      makeRequest("POST", "/retrieve", { query: "test" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns retrieved memories", async () => {
    mockService.retrieveMemories.mockResolvedValue([]);
    const res = await memories.fetch(
      makeRequest("POST", "/retrieve", { query: "test", userId: "u1" }),
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /:id/events", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await memories.fetch(makeRequest("GET", "/mem-1/events"));
    expect(res.status).toBe(400);
  });

  it("returns events", async () => {
    mockService.getMemoryEvents.mockResolvedValue([]);
    const res = await memories.fetch(
      makeRequest("GET", "/mem-1/events", undefined, { userId: "u1" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ events: [] });
  });
});
