import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock neo4j getDriver before importing routes
vi.mock("../../db/neo4j", () => ({
  getDriver: vi.fn(function () {
    return {};
  }),
}));

// Use vi.hoisted so the mock is available in vi.mock factory
const { mockService } = vi.hoisted(() => {
  const mockService = {
    createMemory: vi.fn(),
    getMemory: vi.fn(),
    listMemories: vi.fn(),
    updateMemory: vi.fn(),
    deleteMemory: vi.fn(),
    searchMemories: vi.fn(),
    retrieveMemories: vi.fn(),
    getMemoryEvents: vi.fn(),
  };
  return { mockService };
});

vi.mock("../../db/memory-service", () => ({
  MemoryService: function () {
    return mockService;
  },
}));

import { memories } from "../memories";

const baseMemory = {
  id: "mem-1",
  userId: "user-1",
  title: "Test",
  content: "Content",
  type: "knowledge",
  source: "web",
  confidence: 1.0,
  status: "active",
  tags: ["tag"],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  expiresAt: null,
};

async function request(
  app: typeof memories,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const url = `http://localhost${path}`;
  const req = new Request(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req);
}

describe("POST /memories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a memory and returns 201", async () => {
    mockService.createMemory.mockResolvedValueOnce(baseMemory);

    const res = await request(memories, "POST", "/", {
      userId: "user-1",
      title: "Test",
      content: "Content",
      type: "knowledge",
      source: "web",
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect((json as typeof baseMemory).id).toBe("mem-1");
    expect(mockService.createMemory).toHaveBeenCalledOnce();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(memories, "POST", "/", { userId: "user-1" });
    expect(res.status).toBe(400);
  });
});

describe("GET /memories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists memories for a userId", async () => {
    mockService.listMemories.mockResolvedValueOnce({
      memories: [baseMemory],
      total: 1,
    });

    const res = await request(memories, "GET", "/?userId=user-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      memories: (typeof baseMemory)[];
      total: number;
    };
    expect(json.memories).toHaveLength(1);
    expect(mockService.listMemories).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(memories, "GET", "/");
    expect(res.status).toBe(400);
  });
});

describe("GET /memories/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns memory by id", async () => {
    mockService.getMemory.mockResolvedValueOnce(baseMemory);

    const res = await request(memories, "GET", "/mem-1?userId=user-1");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect((json as typeof baseMemory).id).toBe("mem-1");
  });

  it("returns 404 when memory not found", async () => {
    mockService.getMemory.mockResolvedValueOnce(null);

    const res = await request(memories, "GET", "/missing?userId=user-1");
    expect(res.status).toBe(404);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(memories, "GET", "/mem-1");
    expect(res.status).toBe(400);
  });
});

describe("PATCH /memories/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates a memory", async () => {
    const updated = { ...baseMemory, title: "Updated" };
    mockService.updateMemory.mockResolvedValueOnce(updated);

    const res = await request(memories, "PATCH", "/mem-1?userId=user-1", {
      title: "Updated",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect((json as typeof baseMemory).title).toBe("Updated");
  });

  it("returns 404 when memory not found", async () => {
    mockService.updateMemory.mockResolvedValueOnce(null);

    const res = await request(memories, "PATCH", "/missing?userId=user-1", {
      title: "X",
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /memories/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a memory", async () => {
    mockService.deleteMemory.mockResolvedValueOnce(true);

    const res = await request(memories, "DELETE", "/mem-1?userId=user-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("deleted");
  });

  it("returns 404 when memory not found", async () => {
    mockService.deleteMemory.mockResolvedValueOnce(false);

    const res = await request(memories, "DELETE", "/missing?userId=user-1");
    expect(res.status).toBe(404);
  });
});

describe("POST /memories/search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("searches memories", async () => {
    mockService.searchMemories.mockResolvedValueOnce({
      memories: [baseMemory],
      total: 1,
    });

    const res = await request(memories, "POST", "/search", {
      userId: "user-1",
      query: "test",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { memories: (typeof baseMemory)[] };
    expect(json.memories).toHaveLength(1);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(memories, "POST", "/search", { query: "test" });
    expect(res.status).toBe(400);
  });
});

describe("GET /memories/:id/events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns memory events", async () => {
    const event = {
      id: "evt-1",
      action: "created",
      actor: "web",
      details: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    mockService.getMemoryEvents.mockResolvedValueOnce([event]);

    const res = await request(memories, "GET", "/mem-1/events?userId=user-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { events: (typeof event)[] };
    expect(json.events).toHaveLength(1);
  });
});
