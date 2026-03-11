import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryService } from "./memory-service";

function makeRecord(data: Record<string, unknown>) {
  return {
    get: (key: string) => data[key],
    toObject: () => data,
  };
}

function makeMemoryProps(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    userId: "u1",
    title: "Test Memory",
    content: "Some content",
    type: "episodic",
    source: "manual",
    confidence: 1.0,
    status: "active",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    expiresAt: null,
    ...overrides,
  };
}

function makeNeo4jRecord(props: Record<string, unknown>, tags: string[] = []) {
  const record = {
    m: { properties: props },
    tags,
  };
  return {
    get: (key: string) => record[key as keyof typeof record],
    toObject: () => record,
  };
}

function makeSession(runResult: unknown) {
  return {
    run: vi.fn().mockResolvedValue(runResult),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDriver(session: ReturnType<typeof makeSession>) {
  return { session: vi.fn(() => session) };
}

describe("MemoryService", () => {
  describe("getMemory", () => {
    it("returns null when no records found", async () => {
      const session = makeSession({ records: [] });
      const driver = makeDriver(session);
      const service = new MemoryService(driver as never);

      const result = await service.getMemory("u1", "m1");
      expect(result).toBeNull();
      expect(session.close).toHaveBeenCalled();
    });

    it("returns memory when found", async () => {
      const props = makeMemoryProps();
      const record = makeNeo4jRecord(props, ["tag1"]);
      const session = makeSession({ records: [record] });
      const driver = makeDriver(session);
      const service = new MemoryService(driver as never);

      const result = await service.getMemory("u1", "m1");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("m1");
      expect(result?.tags).toEqual(["tag1"]);
    });
  });

  describe("deleteMemory", () => {
    it("returns false when memory not found (count 0)", async () => {
      const record = {
        get: (k: string) => (k === "deleted" ? { toNumber: () => 0 } : null),
      };
      const session = makeSession({ records: [record] });
      const driver = makeDriver(session);
      const service = new MemoryService(driver as never);

      const result = await service.deleteMemory("u1", "m1");
      expect(result).toBe(false);
    });

    it("returns true when memory deleted (count 1)", async () => {
      const record = {
        get: (k: string) => (k === "deleted" ? { toNumber: () => 1 } : null),
      };
      const session = makeSession({ records: [record] });
      const driver = makeDriver(session);
      const service = new MemoryService(driver as never);

      const result = await service.deleteMemory("u1", "m1");
      expect(result).toBe(true);
    });
  });

  describe("listProposedUpdates", () => {
    it("returns empty array when no proposals", async () => {
      const session = makeSession({ records: [] });
      const driver = makeDriver(session);
      const service = new MemoryService(driver as never);

      const result = await service.listProposedUpdates("u1");
      expect(result).toEqual([]);
    });

    it("returns proposal list", async () => {
      const proposalProps = {
        id: "p1",
        memoryId: "m1",
        proposedContent: "New content",
        reason: "Better wording",
        status: "pending",
        createdAt: "2024-01-01T00:00:00.000Z",
        resolvedAt: null,
      };
      const record = {
        get: (k: string) => (k === "p" ? { properties: proposalProps } : null),
      };
      const session = makeSession({ records: [record] });
      const driver = makeDriver(session);
      const service = new MemoryService(driver as never);

      const result = await service.listProposedUpdates("u1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p1");
    });
  });

  describe("resolveProposal", () => {
    it("returns null when proposal not found or not owned by user", async () => {
      const session = makeSession({ records: [] });
      const driver = makeDriver(session);
      const service = new MemoryService(driver as never);

      const result = await service.resolveProposal("p1", "approve", "u1");
      expect(result).toBeNull();
    });

    it("approves proposal and returns status", async () => {
      const record = {
        get: (k: string) =>
          k === "status" ? "approved" : k === "memoryId" ? "m1" : null,
      };
      const session = makeSession({ records: [record] });
      const driver = makeDriver(session);
      const service = new MemoryService(driver as never);

      const result = await service.resolveProposal("p1", "approve", "u1");
      expect(result?.status).toBe("approved");
      expect(result?.memoryId).toBe("m1");

      // Verify the query included userId for ownership check
      const cypher = session.run.mock.calls[0][0] as string;
      expect(cypher).toContain("userId: $userId");
    });

    it("rejects proposal and returns status", async () => {
      const record = {
        get: (k: string) =>
          k === "status" ? "rejected" : k === "memoryId" ? "m1" : null,
      };
      const session = makeSession({ records: [record] });
      const driver = makeDriver(session);
      const service = new MemoryService(driver as never);

      const result = await service.resolveProposal("p1", "reject", "u1");
      expect(result?.status).toBe("rejected");

      const cypher = session.run.mock.calls[0][0] as string;
      expect(cypher).toContain("userId: $userId");
    });
  });
});
