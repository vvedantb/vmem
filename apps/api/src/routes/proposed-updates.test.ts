import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../middleware/auth", () => ({
  clerkAuth: async (
    c: { set: (k: string, v: string) => void },
    next: () => Promise<void>,
  ) => {
    c.set("userId", "user_test123");
    await next();
  },
}));

vi.mock("../db/neo4j", () => ({
  getDriver: () => ({
    session: () => ({
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}));

const mockListProposedUpdates = vi.fn();
const mockResolveProposal = vi.fn();

vi.mock("../db/memory-service", () => ({
  MemoryService: vi.fn().mockImplementation(() => ({
    listProposedUpdates: mockListProposedUpdates,
    resolveProposal: mockResolveProposal,
  })),
}));

const { proposedUpdates } = await import("./proposed-updates");

const app = new Hono().route("/proposed-updates", proposedUpdates);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /proposed-updates", () => {
  it("returns proposals for the authenticated user", async () => {
    const mockProposals = [
      {
        id: "prop1",
        memoryId: "mem1",
        proposedContent: "New content",
        reason: "Better wording",
        status: "pending",
        createdAt: "2024-01-01T00:00:00Z",
        resolvedAt: null,
      },
    ];
    mockListProposedUpdates.mockResolvedValue(mockProposals);

    const res = await app.request("/proposed-updates", {
      headers: { Authorization: "Bearer fake-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proposals).toEqual(mockProposals);
    expect(mockListProposedUpdates).toHaveBeenCalledWith("user_test123");
  });
});

describe("POST /proposed-updates/:id/approve", () => {
  it("approves a proposal", async () => {
    const result = { status: "approved", memoryId: "mem1" };
    mockResolveProposal.mockResolvedValue(result);

    const res = await app.request("/proposed-updates/prop1/approve", {
      method: "POST",
      headers: { Authorization: "Bearer fake-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(result);
    expect(mockResolveProposal).toHaveBeenCalledWith("prop1", "approve");
  });

  it("returns 404 when proposal not found", async () => {
    mockResolveProposal.mockResolvedValue(null);

    const res = await app.request("/proposed-updates/missing/approve", {
      method: "POST",
      headers: { Authorization: "Bearer fake-token" },
    });

    expect(res.status).toBe(404);
  });
});

describe("POST /proposed-updates/:id/reject", () => {
  it("rejects a proposal", async () => {
    const result = { status: "rejected", memoryId: "mem1" };
    mockResolveProposal.mockResolvedValue(result);

    const res = await app.request("/proposed-updates/prop1/reject", {
      method: "POST",
      headers: { Authorization: "Bearer fake-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(result);
    expect(mockResolveProposal).toHaveBeenCalledWith("prop1", "reject");
  });

  it("returns 404 when proposal not found", async () => {
    mockResolveProposal.mockResolvedValue(null);

    const res = await app.request("/proposed-updates/missing/reject", {
      method: "POST",
      headers: { Authorization: "Bearer fake-token" },
    });

    expect(res.status).toBe(404);
  });
});
