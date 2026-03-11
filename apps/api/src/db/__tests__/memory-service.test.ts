import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryService } from "../memory-service";

function makeRecord(props: Record<string, unknown>, tags: string[] = []) {
  return {
    toObject: () => ({
      m: { properties: props },
      tags,
    }),
    get: (key: string) => {
      if (key === "m") return { properties: props };
      if (key === "tags") return tags;
      return props[key];
    },
  };
}

function makeCountRecord(count: number) {
  return {
    get: () => ({ toNumber: () => count }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSession(runResults: any[][] = []) {
  let callIndex = 0;
  const run = vi.fn(async () => ({
    records: runResults[callIndex++] ?? [],
  }));
  return { run, close: vi.fn() };
}

function makeDriver(session: ReturnType<typeof makeSession>) {
  return { session: vi.fn(() => session) };
}

const baseMemoryProps = {
  id: "mem-1",
  userId: "u1",
  title: "Test",
  content: "Content",
  type: "episodic",
  source: "test",
  confidence: 1.0,
  status: "active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  expiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MemoryService.createMemory", () => {
  it("creates a memory node and returns it", async () => {
    const record = makeRecord(baseMemoryProps, ["tag1"]);
    const session = makeSession([[record]]);
    // logEvent requires a second run
    session.run.mockResolvedValueOnce({ records: [record] });
    session.run.mockResolvedValueOnce({ records: [] });

    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.createMemory({
      userId: "u1",
      title: "Test",
      content: "Content",
      type: "episodic",
      source: "test",
      tags: ["tag1"],
      confidence: 1.0,
    });

    expect(session.run).toHaveBeenCalled();
    expect(result.id).toBe("mem-1");
    expect(result.tags).toEqual(["tag1"]);
    expect(session.close).toHaveBeenCalled();
  });
});

describe("MemoryService.getMemory", () => {
  it("returns null when not found", async () => {
    const session = makeSession([[]]);
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.getMemory("u1", "nonexistent");
    expect(result).toBeNull();
  });

  it("returns memory when found", async () => {
    const record = makeRecord(baseMemoryProps, ["tag1"]);
    const session = makeSession([[record]]);
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.getMemory("u1", "mem-1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("mem-1");
  });
});

describe("MemoryService.listMemories", () => {
  it("queries with userId filter and returns results", async () => {
    const countRecord = makeCountRecord(1);
    const memRecord = makeRecord(baseMemoryProps, []);
    const session = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ records: [countRecord] })
        .mockResolvedValueOnce({ records: [memRecord] }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.listMemories({
      userId: "u1",
      limit: 20,
      offset: 0,
    });
    expect(result.total).toBe(1);
    expect(result.memories).toHaveLength(1);
  });

  it("includes type filter when provided", async () => {
    const countRecord = makeCountRecord(0);
    const session = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ records: [countRecord] })
        .mockResolvedValueOnce({ records: [] }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    await service.listMemories({
      userId: "u1",
      type: "profile",
      limit: 10,
      offset: 0,
    });
    const query = session.run.mock.calls[0][0] as string;
    expect(query).toContain("m.type = $type");
  });
});

describe("MemoryService.updateMemory", () => {
  it("returns null when memory not found", async () => {
    const session = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.updateMemory("u1", "mem-1", { title: "New" });
    expect(result).toBeNull();
  });

  it("updates and returns the memory", async () => {
    const record = makeRecord({ ...baseMemoryProps, title: "New" }, []);
    const session = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ records: [record] })
        .mockResolvedValueOnce({ records: [] }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.updateMemory("u1", "mem-1", { title: "New" });
    expect(result).not.toBeNull();
    expect(result!.title).toBe("New");
  });
});

describe("MemoryService.deleteMemory", () => {
  it("returns false when nothing deleted", async () => {
    const session = {
      run: vi
        .fn()
        .mockResolvedValue({
          records: [{ get: () => ({ toNumber: () => 0 }) }],
        }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.deleteMemory("u1", "mem-1");
    expect(result).toBe(false);
  });

  it("returns true when deleted", async () => {
    const session = {
      run: vi
        .fn()
        .mockResolvedValue({
          records: [{ get: () => ({ toNumber: () => 1 }) }],
        }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.deleteMemory("u1", "mem-1");
    expect(result).toBe(true);
  });
});

describe("MemoryService.listProposedUpdates", () => {
  it("returns empty array when no proposals", async () => {
    const session = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.listProposedUpdates("u1");
    expect(result).toEqual([]);
  });

  it("returns proposals", async () => {
    const propProps = {
      id: "prop-1",
      memoryId: "mem-1",
      proposedContent: "New content",
      reason: "Test",
      status: "pending",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    const record = {
      get: (key: string) => (key === "p" ? { properties: propProps } : null),
    };
    const session = {
      run: vi.fn().mockResolvedValue({ records: [record] }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.listProposedUpdates("u1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("prop-1");
  });
});

describe("MemoryService.resolveProposal", () => {
  it("returns null when proposal not found", async () => {
    const session = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.resolveProposal("prop-1", "approve");
    expect(result).toBeNull();
  });

  it("approves a proposal", async () => {
    const record = {
      get: (key: string) => (key === "status" ? "approved" : "mem-1"),
    };
    const session = {
      run: vi.fn().mockResolvedValue({ records: [record] }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.resolveProposal("prop-1", "approve");
    expect(result).toEqual({ status: "approved", memoryId: "mem-1" });
  });

  it("rejects a proposal", async () => {
    const record = {
      get: (key: string) => (key === "status" ? "rejected" : "mem-1"),
    };
    const session = {
      run: vi.fn().mockResolvedValue({ records: [record] }),
      close: vi.fn(),
    };
    const driver = makeDriver(session);
    const service = new MemoryService(driver as never);

    const result = await service.resolveProposal("prop-1", "reject");
    expect(result).toEqual({ status: "rejected", memoryId: "mem-1" });
  });
});
