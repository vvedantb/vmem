import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mockService = vi.hoisted(() => ({
  createMemory: vi.fn(),
  listMemories: vi.fn(),
  getMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
  searchMemories: vi.fn(),
  retrieveMemories: vi.fn(),
  getMemoryEvents: vi.fn(),
}));

vi.mock("../db/neo4j", () => ({ getDriver: vi.fn(() => ({})) }));

vi.mock("../db/memory-service", () => ({
  MemoryService: function (this: object) {
    Object.assign(this, mockService);
  },
}));

const { memories } = await import("./memories");

const app = new Hono();
app.route("/memories", memories);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /memories", () => {
  it("returns 201 with created memory", async () => {
    const newMemory = {
      id: "m1",
      userId: "u1",
      title: "Test",
      content: "Content",
      type: "episodic",
      source: "manual",
      tags: [],
      confidence: 1.0,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: null,
    };
    mockService.createMemory.mockResolvedValue(newMemory);

    const res = await app.request("/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        title: "Test",
        content: "Content",
        type: "episodic",
        source: "manual",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("m1");
  });

  it("returns 400 on invalid body", async () => {
    const res = await app.request("/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /memories", () => {
  it("returns 400 without userId", async () => {
    const res = await app.request("/memories");
    expect(res.status).toBe(400);
  });

  it("returns memory list for valid userId", async () => {
    mockService.listMemories.mockResolvedValue({ memories: [], total: 0 });
    const res = await app.request("/memories?userId=u1");
    expect(res.status).toBe(200);
    expect(mockService.listMemories).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1" }),
    );
  });
});

describe("GET /memories/:id", () => {
  it("returns 400 without userId", async () => {
    const res = await app.request("/memories/m1");
    expect(res.status).toBe(400);
  });

  it("returns 404 when memory not found", async () => {
    mockService.getMemory.mockResolvedValue(null);
    const res = await app.request("/memories/m1?userId=u1");
    expect(res.status).toBe(404);
  });

  it("returns memory when found", async () => {
    const mem = { id: "m1", title: "T" };
    mockService.getMemory.mockResolvedValue(mem);
    const res = await app.request("/memories/m1?userId=u1");
    expect(res.status).toBe(200);
  });
});

describe("DELETE /memories/:id", () => {
  it("returns 400 without userId", async () => {
    const res = await app.request("/memories/m1", { method: "DELETE" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    mockService.deleteMemory.mockResolvedValue(false);
    const res = await app.request("/memories/m1?userId=u1", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("returns deleted status on success", async () => {
    mockService.deleteMemory.mockResolvedValue(true);
    const res = await app.request("/memories/m1?userId=u1", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("deleted");
  });
});
