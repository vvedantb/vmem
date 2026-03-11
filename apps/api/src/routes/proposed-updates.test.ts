import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mockService = vi.hoisted(() => ({
  listProposedUpdates: vi.fn(),
  resolveProposal: vi.fn(),
}));

vi.mock("../db/neo4j", () => ({ getDriver: vi.fn(() => ({})) }));

vi.mock("../db/memory-service", () => ({
  MemoryService: function (this: object) {
    Object.assign(this, mockService);
  },
}));

const { proposedUpdates } = await import("./proposed-updates");

const app = new Hono();
app.route("/proposed-updates", proposedUpdates);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /proposed-updates", () => {
  it("returns 400 without userId", async () => {
    const res = await app.request("/proposed-updates");
    expect(res.status).toBe(400);
  });

  it("returns proposals for valid userId", async () => {
    mockService.listProposedUpdates.mockResolvedValue([]);
    const res = await app.request("/proposed-updates?userId=u1");
    expect(res.status).toBe(200);
    expect(mockService.listProposedUpdates).toHaveBeenCalledWith("u1");
  });
});

describe("POST /proposed-updates/:id/approve", () => {
  it("returns 400 without userId", async () => {
    const res = await app.request("/proposed-updates/p1/approve", {
      method: "POST",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when proposal not found", async () => {
    mockService.resolveProposal.mockResolvedValue(null);
    const res = await app.request("/proposed-updates/p1/approve?userId=u1", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("approves proposal and returns result", async () => {
    const result = { status: "approved", memoryId: "m1" };
    mockService.resolveProposal.mockResolvedValue(result);
    const res = await app.request("/proposed-updates/p1/approve?userId=u1", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(mockService.resolveProposal).toHaveBeenCalledWith(
      "p1",
      "approve",
      "u1",
    );
  });
});

describe("POST /proposed-updates/:id/reject", () => {
  it("returns 400 without userId", async () => {
    const res = await app.request("/proposed-updates/p1/reject", {
      method: "POST",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when proposal not found", async () => {
    mockService.resolveProposal.mockResolvedValue(null);
    const res = await app.request("/proposed-updates/p1/reject?userId=u1", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("rejects proposal and returns result", async () => {
    const result = { status: "rejected", memoryId: "m1" };
    mockService.resolveProposal.mockResolvedValue(result);
    const res = await app.request("/proposed-updates/p1/reject?userId=u1", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(mockService.resolveProposal).toHaveBeenCalledWith(
      "p1",
      "reject",
      "u1",
    );
  });
});
