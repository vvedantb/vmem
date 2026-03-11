import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useApiKeyActions } from "../../components/api-keys/useApiKeyActions";

// Mock convex/react
const mockRevokeMutation = vi.fn();
const mockRevealAction = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => mockRevokeMutation),
  useAction: vi.fn(() => mockRevealAction),
}));

// Mock @vmem/backend
vi.mock("@vmem/backend", () => ({
  api: {
    apiKeys: {
      revokeMy: "revokeMy",
      revealMy: "revealMy",
    },
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock clipboard
const mockWriteText = vi.fn();
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: mockWriteText },
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockWriteText.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useApiKeyActions", () => {
  it("initializes with default state", () => {
    const { result } = renderHook(() => useApiKeyActions());
    expect(result.current.revokeKeyId).toBeNull();
    expect(result.current.isRevoking).toBe(false);
    expect(result.current.copiedKeyId).toBeNull();
    expect(result.current.copyingKeyId).toBeNull();
    expect(result.current.revealedKeys).toEqual({});
    expect(result.current.revealingKeyId).toBeNull();
  });

  it("handleToggleReveal stores key and sets auto-clear timer", async () => {
    mockRevealAction.mockResolvedValue("vmem_sk_test_key");

    const { result } = renderHook(() => useApiKeyActions());

    await act(async () => {
      await result.current.handleToggleReveal("key-1" as never);
    });

    expect(result.current.revealedKeys["key-1"]).toBe("vmem_sk_test_key");

    // Advance past auto-clear timeout (30s)
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.revealedKeys["key-1"]).toBeUndefined();
  });

  it("handleToggleReveal clears key when already revealed", async () => {
    mockRevealAction.mockResolvedValue("vmem_sk_test_key");

    const { result } = renderHook(() => useApiKeyActions());

    await act(async () => {
      await result.current.handleToggleReveal("key-1" as never);
    });
    expect(result.current.revealedKeys["key-1"]).toBe("vmem_sk_test_key");

    await act(async () => {
      await result.current.handleToggleReveal("key-1" as never);
    });
    expect(result.current.revealedKeys["key-1"]).toBeUndefined();
  });

  it("handleToggleReveal shows error toast on failure", async () => {
    const { toast } = await import("sonner");
    mockRevealAction.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useApiKeyActions());

    await act(async () => {
      await result.current.handleToggleReveal("key-1" as never);
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to reveal API key");
    expect(result.current.revealedKeys["key-1"]).toBeUndefined();
  });

  it("handleCopyKey copies existing revealed key", async () => {
    const { toast } = await import("sonner");
    mockRevealAction.mockResolvedValue("vmem_sk_test_key");

    const { result } = renderHook(() => useApiKeyActions());

    // First reveal the key
    await act(async () => {
      await result.current.handleToggleReveal("key-1" as never);
    });

    // Then copy it
    await act(async () => {
      await result.current.handleCopyKey("key-1" as never);
    });

    expect(mockWriteText).toHaveBeenCalledWith("vmem_sk_test_key");
    expect(toast.success).toHaveBeenCalledWith("API key copied to clipboard");
    expect(result.current.copiedKeyId).toBe("key-1");
  });

  it("handleCopyKey fetches key when not already revealed", async () => {
    const { toast } = await import("sonner");
    mockRevealAction.mockResolvedValue("vmem_sk_fetched_key");

    const { result } = renderHook(() => useApiKeyActions());

    await act(async () => {
      await result.current.handleCopyKey("key-2" as never);
    });

    expect(mockRevealAction).toHaveBeenCalledWith({ id: "key-2" });
    expect(mockWriteText).toHaveBeenCalledWith("vmem_sk_fetched_key");
    expect(toast.success).toHaveBeenCalledWith("API key copied to clipboard");
    // Key should NOT be stored in revealedKeys after copy-only
    expect(result.current.revealedKeys["key-2"]).toBeUndefined();
  });

  it("handleRevoke revokes key and clears revokeKeyId", async () => {
    const { toast } = await import("sonner");
    mockRevokeMutation.mockResolvedValue(true);

    const { result } = renderHook(() => useApiKeyActions());

    act(() => {
      result.current.setRevokeKeyId("key-1" as never);
    });

    await act(async () => {
      await result.current.handleRevoke();
    });

    expect(mockRevokeMutation).toHaveBeenCalledWith({ id: "key-1" });
    expect(result.current.revokeKeyId).toBeNull();
    expect(result.current.isRevoking).toBe(false);
    expect(toast.success).toHaveBeenCalled();
  });

  it("handleRevoke shows error on failure", async () => {
    const { toast } = await import("sonner");
    mockRevokeMutation.mockRejectedValue(new Error("Revoke failed"));

    const { result } = renderHook(() => useApiKeyActions());

    act(() => {
      result.current.setRevokeKeyId("key-1" as never);
    });

    await act(async () => {
      await result.current.handleRevoke();
    });

    expect(toast.error).toHaveBeenCalledWith("Revoke failed");
    expect(result.current.isRevoking).toBe(false);
  });
});
