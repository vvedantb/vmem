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
    listProposedUpdates: vi.fn(),
    createProposedUpdate: vi.fn(),
    resolveProposal: vi.fn(),
  };
  return { mockService };
});

vi.mock("../../db/memory-service", () => ({
  MemoryService: function () {
    return mockService;
  },
}));

import { proposedUpdates } from "../proposed-updates";

const baseProposal = {
  id: "prop-1",
  memoryId: "mem-1",
  proposedContent: "Updated content",
  reason: "More accurate",
  status: "pending" as const,
  createdAt: "2024-01-01T00:00:00.000Z",
  resolvedAt: null,
};

async function request(
  app: typeof proposedUpdates,
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

describe("GET /proposed-updates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists pending proposals for a user", async () => {
    mockService.listProposedUpdates.mockResolvedValueOnce([baseProposal]);

    const res = await request(proposedUpdates, "GET", "/?userId=user-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { proposals: (typeof baseProposal)[] };
    expect(json.proposals).toHaveLength(1);
    expect(json.proposals[0].id).toBe("prop-1");
    expect(mockService.listProposedUpdates).toHaveBeenCalledWith("user-1");
  });

  it("returns 400 when userId is missing", async () => {
    const res = await request(proposedUpdates, "GET", "/");
    expect(res.status).toBe(400);
  });
});

describe("POST /proposed-updates/:id/approve", () => {
  beforeEach(() => vi.clearAllMocks());

  it("approves a proposal", async () => {
    mockService.resolveProposal.mockResolvedValueOnce({
      status: "approved",
      memoryId: "mem-1",
    });

    const res = await request(proposedUpdates, "POST", "/prop-1/approve");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; memoryId: string };
    expect(json.status).toBe("approved");
    expect(json.memoryId).toBe("mem-1");
    expect(mockService.resolveProposal).toHaveBeenCalledWith(
      "prop-1",
      "approve",
    );
  });

  it("returns 404 when proposal not found", async () => {
    mockService.resolveProposal.mockResolvedValueOnce(null);

    const res = await request(proposedUpdates, "POST", "/missing/approve");
    expect(res.status).toBe(404);
  });
});

describe("POST /proposed-updates/:id/reject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a proposal", async () => {
    mockService.resolveProposal.mockResolvedValueOnce({
      status: "rejected",
      memoryId: "mem-1",
    });

    const res = await request(proposedUpdates, "POST", "/prop-1/reject");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; memoryId: string };
    expect(json.status).toBe("rejected");
    expect(mockService.resolveProposal).toHaveBeenCalledWith(
      "prop-1",
      "reject",
    );
  });

  it("returns 404 when proposal not found", async () => {
    mockService.resolveProposal.mockResolvedValueOnce(null);

    const res = await request(proposedUpdates, "POST", "/missing/reject");
    expect(res.status).toBe(404);
  });
});
