// AI-generated (Claude), prompt: "test api key name normalize and stable sha256 hash"
// Modified by me: rejected empty and overlong names
import { describe, expect, it } from "vitest";
import { hashApiKey, normalizeApiKeyName } from "./apiKeys";

describe("normalizeApiKeyName", () => {
  it("trims whitespace and accepts valid names", () => {
    expect(normalizeApiKeyName("  Production  ")).toBe("Production");
  });

  it("rejects empty names", () => {
    expect(() => normalizeApiKeyName("   ")).toThrow("Name is required");
  });

  it("rejects names longer than 50 characters", () => {
    expect(() => normalizeApiKeyName("a".repeat(51))).toThrow(
      "Name must be 50 characters or less",
    );
  });
});

describe("hashApiKey", () => {
  it("returns a stable hex digest for the same key", async () => {
    const key = "vmem_sk_same_key_material";
    const first = await hashApiKey(key);
    const second = await hashApiKey(key);
    expect(second).toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns different digests for different keys", async () => {
    const first = await hashApiKey("vmem_sk_one");
    const second = await hashApiKey("vmem_sk_two");
    expect(second).not.toBe(first);
  });
});
