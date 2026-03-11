import { describe, it, expect, vi, beforeEach } from "vitest";
import { proposedUpdates } from "../proposed-updates";

vi.mock("../../db/neo4j", () => ({
  getDriver: vi.fn(() => ({})),
}));

const mockService = {
  listProposedUpdates: vi.fn(),
  resolveProposal: vi.fn(),
};

vi.mock("../../db/memory-service", () => ({
  MemoryService: vi.fn(() => mockService),
}));

function makeRequest(
  method: string,
  path: string,
  query?: Record<string, string>,
): Request {
  const url = new URL(`http://localhost${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url.toString(), { method });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /", () => {
  it("returns 400 when userId is missing", async () => {
    const res = await proposedUpdates.fetch(makeRequest("GET", "/"));
    expect(res.status).toBe(400);
  });

  it("returns proposals", async () => {
    mockService.listProposedUpdates.mockResolvedValue([]);
    const res = await proposedUpdates.fetch(
      makeRequest("GET", "/", { userId: "u1" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ proposals: [] });
  });

  it("returns 500 on service error", async () => {
    mockService.listProposedUpdates.mockRejectedValue(new Error("DB error"));
    const res = await proposedUpdates.fetch(
      makeRequest("GET", "/", { userId: "u1" }),
    );
    expect(res.status).toBe(500);
  });
});

describe("POST /:id/approve", () => {
  it("returns 404 when proposal not found", async () => {
    mockService.resolveProposal.mockResolvedValue(null);
    const res = await proposedUpdates.fetch(
      makeRequest("POST", "/prop-1/approve"),
    );
    expect(res.status).toBe(404);
  });

  it("approves proposal", async () => {
    const result = { status: "approved", memoryId: "mem-1" };
    mockService.resolveProposal.mockResolvedValue(result);
    const res = await proposedUpdates.fetch(
      makeRequest("POST", "/prop-1/approve"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(mockService.resolveProposal).toHaveBeenCalledWith(
      "prop-1",
      "approve",
    );
  });

  it("returns 500 on service error", async () => {
    mockService.resolveProposal.mockRejectedValue(new Error("DB error"));
    const res = await proposedUpdates.fetch(
      makeRequest("POST", "/prop-1/approve"),
    );
    expect(res.status).toBe(500);
  });
});

describe("POST /:id/reject", () => {
  it("returns 404 when proposal not found", async () => {
    mockService.resolveProposal.mockResolvedValue(null);
    const res = await proposedUpdates.fetch(
      makeRequest("POST", "/prop-1/reject"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects proposal", async () => {
    const result = { status: "rejected", memoryId: "mem-1" };
    mockService.resolveProposal.mockResolvedValue(result);
    const res = await proposedUpdates.fetch(
      makeRequest("POST", "/prop-1/reject"),
    );
    expect(res.status).toBe(200);
    expect(mockService.resolveProposal).toHaveBeenCalledWith(
      "prop-1",
      "reject",
    );
  });

  it("returns 500 on service error", async () => {
    mockService.resolveProposal.mockRejectedValue(new Error("DB error"));
    const res = await proposedUpdates.fetch(
      makeRequest("POST", "/prop-1/reject"),
    );
    expect(res.status).toBe(500);
  });
});
