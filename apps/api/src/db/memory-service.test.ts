import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryService } from "./memory-service";

// Build a minimal mock Neo4j driver/session
function makeSession(records: Record<string, unknown>[] = []) {
  const toObject = (rec: Record<string, unknown>) => rec;
  return {
    run: vi.fn().mockResolvedValue({
      records: records.map((r) => ({
        toObject: () => r,
        get: (k: string) => r[k],
      })),
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDriver(records: Record<string, unknown>[] = []) {
  const session = makeSession(records);
  return {
    session: () => session,
    _session: session,
  };
}

function makeMemoryNode(overrides: Record<string, unknown> = {}) {
  return {
    m: {
      properties: {
        id: "mem1",
        userId: "user1",
        title: "Test Memory",
        content: "Content here",
        type: "knowledge",
        source: "web",
        confidence: 1,
        status: "active",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        expiresAt: null,
        ...overrides,
      },
    },
    tags: ["tag1"],
  };
}

describe("MemoryService.getMemory", () => {
  it("returns null when no records found", async () => {
    const driver = makeDriver([]);
    const service = new MemoryService(driver as never);

    const result = await service.getMemory("user1", "nonexistent");

    expect(result).toBeNull();
  });

  it("returns memory with tags when found", async () => {
    const driver = makeDriver([makeMemoryNode()]);
    const service = new MemoryService(driver as never);

    const result = await service.getMemory("user1", "mem1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("mem1");
    expect(result!.title).toBe("Test Memory");
    expect(result!.tags).toEqual(["tag1"]);
  });
});

describe("MemoryService.deleteMemory", () => {
  it("returns false when memory not found", async () => {
    const driver = makeDriver();
    // Override run to return deleted count 0
    driver._session.run.mockResolvedValueOnce({
      records: [
        {
          get: (k: string) => (k === "deleted" ? { toNumber: () => 0 } : null),
        },
      ],
    });
    const service = new MemoryService(driver as never);

    const result = await service.deleteMemory("user1", "nonexistent");

    expect(result).toBe(false);
  });

  it("returns true when memory is deleted", async () => {
    const driver = makeDriver();
    driver._session.run.mockResolvedValueOnce({
      records: [
        {
          get: (k: string) => (k === "deleted" ? { toNumber: () => 1 } : null),
        },
      ],
    });
    const service = new MemoryService(driver as never);

    const result = await service.deleteMemory("user1", "mem1");

    expect(result).toBe(true);
    expect(driver._session.run).toHaveBeenCalledWith(
      expect.stringContaining("DETACH DELETE"),
      expect.objectContaining({ memoryId: "mem1", userId: "user1" }),
    );
  });
});

describe("MemoryService.listMemories", () => {
  it("returns paginated memories with total count", async () => {
    const driver = makeDriver();
    // First call: count query
    driver._session.run
      .mockResolvedValueOnce({
        records: [{ get: () => ({ toNumber: () => 1 }) }],
      })
      // Second call: data query
      .mockResolvedValueOnce({
        records: [{ toObject: () => makeMemoryNode() }],
      });

    const service = new MemoryService(driver as never);
    const result = await service.listMemories({
      userId: "user1",
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].id).toBe("mem1");
  });
});

describe("MemoryService.updateMemory", () => {
  it("returns null when memory not found", async () => {
    const driver = makeDriver([]);
    const service = new MemoryService(driver as never);

    const result = await service.updateMemory("user1", "missing", {
      title: "New",
    });

    expect(result).toBeNull();
  });

  it("updates and returns the memory", async () => {
    const driver = makeDriver();
    const updatedNode = makeMemoryNode({ title: "Updated" });
    driver._session.run
      .mockResolvedValueOnce({
        records: [{ toObject: () => updatedNode }],
      })
      // logEvent call
      .mockResolvedValueOnce({ records: [] });

    const service = new MemoryService(driver as never);
    const result = await service.updateMemory("user1", "mem1", {
      title: "Updated",
    });

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Updated");
  });
});

describe("MemoryService.createProposedUpdate", () => {
  it("creates and returns a proposed update", async () => {
    const driver = makeDriver();
    driver._session.run.mockResolvedValueOnce({
      records: [
        {
          get: (k: string) =>
            ({
              properties: {
                id: "prop1",
                memoryId: "mem1",
                proposedContent: "Better content",
                reason: "Clearer",
                status: "pending",
                createdAt: "2024-01-01T00:00:00Z",
                resolvedAt: null,
              },
            })[k] ?? null,
        },
      ],
    });

    const service = new MemoryService(driver as never);
    const result = await service.createProposedUpdate({
      memoryId: "mem1",
      proposedContent: "Better content",
      reason: "Clearer",
    });

    expect(result.id).toBe("prop1");
    expect(result.status).toBe("pending");
    expect(result.resolvedAt).toBeNull();
  });
});

describe("MemoryService.resolveProposal", () => {
  it("returns null when proposal not found", async () => {
    const driver = makeDriver([]);
    const service = new MemoryService(driver as never);

    const result = await service.resolveProposal("missing", "approve");

    expect(result).toBeNull();
  });

  it("approves proposal and returns result", async () => {
    const driver = makeDriver();
    driver._session.run.mockResolvedValueOnce({
      records: [{ get: (k: string) => (k === "status" ? "approved" : "mem1") }],
    });

    const service = new MemoryService(driver as never);
    const result = await service.resolveProposal("prop1", "approve");

    expect(result).toEqual({ status: "approved", memoryId: "mem1" });
    expect(driver._session.run).toHaveBeenCalledWith(
      expect.stringContaining("approved"),
      expect.objectContaining({ proposalId: "prop1" }),
    );
  });
});

describe("toMemoryWithTags validation", () => {
  it("throws when record has no m node", async () => {
    const driver = makeDriver();
    driver._session.run.mockResolvedValueOnce({
      records: [{ toObject: () => ({ m: null, tags: [] }) }],
    });

    const service = new MemoryService(driver as never);

    await expect(service.getMemory("user1", "mem1")).rejects.toThrow(
      "Invalid memory record",
    );
  });

  it("throws when node has no properties", async () => {
    const driver = makeDriver();
    driver._session.run.mockResolvedValueOnce({
      records: [{ toObject: () => ({ m: {}, tags: [] }) }],
    });

    const service = new MemoryService(driver as never);

    await expect(service.getMemory("user1", "mem1")).rejects.toThrow(
      "Invalid memory record",
    );
  });
});
