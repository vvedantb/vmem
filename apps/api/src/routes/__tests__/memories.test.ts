import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock the database dependencies
vi.mock("../../db/neo4j", () => ({
  getDriver: vi.fn(),
}));

const mockCreateMemory = vi.fn().mockResolvedValue({
  id: "test-id",
  userId: "user-1",
  title: "Test",
  content: "Content",
  type: "episodic",
  source: "api",
  confidence: 1.0,
  status: "active",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  expiresAt: null,
  tags: [],
});
const mockListMemories = vi.fn().mockResolvedValue({ memories: [], total: 0 });
const mockGetMemory = vi.fn().mockResolvedValue(null);
const mockUpdateMemory = vi.fn().mockResolvedValue(null);
const mockDeleteMemory = vi.fn().mockResolvedValue(false);
const mockSearchMemories = vi
  .fn()
  .mockResolvedValue({ memories: [], total: 0 });
const mockRetrieveMemories = vi.fn().mockResolvedValue([]);
const mockGetMemoryEvents = vi.fn().mockResolvedValue([]);

vi.mock("../../db/memory-service", () => ({
  MemoryService: class {
    createMemory = mockCreateMemory;
    listMemories = mockListMemories;
    getMemory = mockGetMemory;
    updateMemory = mockUpdateMemory;
    deleteMemory = mockDeleteMemory;
    searchMemories = mockSearchMemories;
    retrieveMemories = mockRetrieveMemories;
    getMemoryEvents = mockGetMemoryEvents;
  },
}));

// Import after mocks
const { memories } = await import("../memories.js");

const app = new Hono();
app.route("/memories", memories);

describe("memories routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /memories - validation", () => {
    it("returns 400 when body is invalid", async () => {
      const res = await app.request("/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }), // missing required fields
      });
      expect(res.status).toBe(400);
    });

    it("returns 201 on valid creation", async () => {
      const res = await app.request("/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "user-1",
          title: "Test Memory",
          content: "Some content",
          type: "episodic",
          source: "test",
          tags: [],
          confidence: 1.0,
        }),
      });
      expect(res.status).toBe(201);
    });
  });

  describe("GET /memories - validation", () => {
    it("returns 400 when userId is missing", async () => {
      const res = await app.request("/memories");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("userId query param required");
    });

    it("returns 200 with userId", async () => {
      const res = await app.request("/memories?userId=user-1");
      expect(res.status).toBe(200);
    });
  });

  describe("GET /memories/:id - validation", () => {
    it("returns 400 when userId is missing", async () => {
      const res = await app.request("/memories/some-id");
      expect(res.status).toBe(400);
    });

    it("returns 404 when memory not found", async () => {
      const res = await app.request("/memories/nonexistent?userId=user-1");
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /memories/:id - validation", () => {
    it("returns 400 when userId is missing", async () => {
      const res = await app.request("/memories/some-id", { method: "DELETE" });
      expect(res.status).toBe(400);
    });

    it("returns 404 when memory not found", async () => {
      const res = await app.request("/memories/nonexistent?userId=user-1", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});
