import { describe, expect, it, vi } from "vitest";
import { resolveBearerAuth } from "../../convex/http/v1Memories/bearerToken";

function resolvers() {
  return {
    apiKey: vi.fn(async () => "api-key-auth"),
    clerk: vi.fn(async () => "clerk-auth"),
  };
}

describe("resolveBearerAuth", () => {
  it("sends vmem_sk_ tokens through the API key path only", async () => {
    const r = resolvers();
    await expect(resolveBearerAuth("vmem_sk_abc", r)).resolves.toBe(
      "api-key-auth",
    );
    expect(r.apiKey).toHaveBeenCalledWith("vmem_sk_abc");
    expect(r.clerk).not.toHaveBeenCalled();
  });

  it("treats any other bearer as a Clerk token", async () => {
    const r = resolvers();
    await expect(resolveBearerAuth("eyJhbGciOi.payload.sig", r)).resolves.toBe(
      "clerk-auth",
    );
    expect(r.clerk).toHaveBeenCalledWith("eyJhbGciOi.payload.sig");
    expect(r.apiKey).not.toHaveBeenCalled();
  });

  it("returns null when the matching resolver rejects the token", async () => {
    const r = { apiKey: async () => null, clerk: async () => null };
    await expect(resolveBearerAuth("vmem_sk_bad", r)).resolves.toBeNull();
    await expect(resolveBearerAuth("not-a-jwt", r)).resolves.toBeNull();
  });
});
