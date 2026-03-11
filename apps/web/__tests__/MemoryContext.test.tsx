import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock @clerk/nextjs
const mockUserId = vi.fn(() => "user-123");
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: mockUserId() }),
}));

// Mock env
vi.mock("@/env/client", () => ({
  clientEnv: { NEXT_PUBLIC_API_URL: "http://localhost:3001" },
}));

import {
  MemoryProvider,
  useMemoryContext,
} from "@/components/contexts/MemoryContext";

function TestConsumer() {
  const { memories, isLoading, createMemory, updateMemory, deleteMemory } =
    useMemoryContext();

  return (
    <div>
      <div data-testid="loading">{isLoading ? "loading" : "done"}</div>
      <ul data-testid="memory-list">
        {memories.map((m) => (
          <li key={m.id} data-testid={`memory-${m.id}`}>
            {m.title}
          </li>
        ))}
      </ul>
      <button
        onClick={() =>
          createMemory({ title: "New Memory", content: "Content" })
        }
      >
        Create
      </button>
      <button onClick={() => updateMemory({ id: "mem-1", title: "Updated" })}>
        Update
      </button>
      <button onClick={() => deleteMemory("mem-1")}>Delete</button>
    </div>
  );
}

const apiMemory = {
  id: "mem-1",
  userId: "user-123",
  title: "Test Memory",
  content: "Test content",
  type: "knowledge",
  source: "web",
  confidence: 1.0,
  status: "active",
  tags: ["tag1"],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  expiresAt: null,
};

describe("MemoryContext", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("fetches memories on mount and transforms API data", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ memories: [apiMemory], total: 1 }),
    } as Response);

    render(
      <MemoryProvider>
        <TestConsumer />
      </MemoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    expect(screen.getByTestId("memory-mem-1")).toHaveTextContent("Test Memory");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/memories?userId=user-123"),
    );
  });

  it("handles fetch network failure gracefully", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    render(
      <MemoryProvider>
        <TestConsumer />
      </MemoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("fetchMemories"),
      expect.any(Error),
    );
    expect(screen.getByTestId("memory-list").children).toHaveLength(0);
    consoleError.mockRestore();
  });

  it("handles server error response gracefully", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    render(
      <MemoryProvider>
        <TestConsumer />
      </MemoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("fetchMemories"),
      500,
      "Internal Server Error",
    );
    consoleError.mockRestore();
  });

  it("createMemory posts to API and adds memory to list", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ memories: [], total: 0 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => apiMemory,
      } as Response);

    render(
      <MemoryProvider>
        <TestConsumer />
      </MemoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    await act(async () => {
      await userEvent.click(screen.getByText("Create"));
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/memories"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByTestId("memory-mem-1")).toHaveTextContent("Test Memory");
  });

  it("updateMemory logs error when server returns non-ok", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ memories: [apiMemory], total: 1 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

    render(
      <MemoryProvider>
        <TestConsumer />
      </MemoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    await act(async () => {
      await userEvent.click(screen.getByText("Update"));
    });

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("updateMemory"),
      404,
      "Not Found",
    );
    consoleError.mockRestore();
  });

  it("deleteMemory removes memory from list on success", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ memories: [apiMemory], total: 1 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "deleted" }),
      } as Response);

    render(
      <MemoryProvider>
        <TestConsumer />
      </MemoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("memory-mem-1")).toBeInTheDocument();
    });

    await act(async () => {
      await userEvent.click(screen.getByText("Delete"));
    });

    expect(screen.queryByTestId("memory-mem-1")).not.toBeInTheDocument();
  });

  it("apiToMemory correctly transforms API response fields", async () => {
    const richApiMemory = {
      ...apiMemory,
      title: "Rich Memory",
      tags: ["a", "b"],
      createdAt: "2024-06-15T12:00:00.000Z",
    };
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ memories: [richApiMemory], total: 1 }),
    } as Response);

    render(
      <MemoryProvider>
        <TestConsumer />
      </MemoryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("memory-mem-1")).toHaveTextContent(
        "Rich Memory",
      );
    });
  });
});
