import { describe, expect, it } from "vitest";
import { hashApiKey } from "./apiKeys";

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
