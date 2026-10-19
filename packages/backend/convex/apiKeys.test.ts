// AI-generated (Claude), prompt: "test api key name normalize and stable sha256 hash"
// Modified by me: rejected empty and overlong names
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerAuditLog } from "convex-audit-log/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { hashApiKey, normalizeApiKeyName } from "./apiKeys";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

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

// Pins the raw key, hash, mask and stored ciphertext. Expected values were
// computed separately with node:crypto and Buffer.
describe("createMy key format", () => {
  const RAW_KEY = "vmem_sk_qLXCz9zp9gMQHSo3RFFea3iFkp-sucbT";

  function fixedRandomValues<T extends ArrayBufferView | null>(array: T): T {
    if (array instanceof Uint8Array) {
      const n = array.length;
      for (let i = 0; i < n; i++) array[i] = (n * 7 + i * 13) & 0xff;
    }
    return array;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("stores vmem_sk_<base64url of 24 bytes>, its sha256 hex and v1 ciphertext", async () => {
    vi.stubEnv(
      "ENCRYPTION_KEY",
      "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
    );
    const t = convexTest(schema, modules);
    registerAuditLog(t);
    const user = t.withIdentity({
      subject: "clerk_api_key_owner",
      email: "owner@example.com",
    });
    await user.mutation(api.auth.ensureUserExists, {});

    vi.spyOn(crypto, "getRandomValues").mockImplementation(fixedRandomValues);
    const created = await user.action(api.apiKeys.createMy, { name: " CI " });
    vi.restoreAllMocks();

    expect(created.key).toBe(RAW_KEY);
    expect(created.name).toBe("CI");
    expect(created.maskedKey).toBe("vmem_sk_qLXC****************ucbT");

    const stored = await t.run((ctx) => ctx.db.get(created.id));
    expect(stored?.keyHash).toBe(
      "12438fad64b371bdf2db9c4dab57e9522ddd53bd47dae7af271f1cb5132d5d24",
    );
    expect(stored?.encryptedKey).toBe(
      "v1:VGFue4iVoq+8ydbj:etwMECvhc1R5d+XodIlzjIskL5kuDVMO9qgN1NHnkbE7xqV47qPiJvXQVC3pORnQrRx5wL6LPJ8=",
    );
    expect(await user.action(api.apiKeys.revealMy, { id: created.id })).toBe(
      RAW_KEY,
    );
  });

  it("hashes as lowercase sha256 hex of the UTF-8 key", async () => {
    expect(await hashApiKey("vmem_sk_one")).toBe(
      "2e2e32935307822990fb22d1eb3f8da56177736c263941398e18bd9e5883dc4b",
    );
    expect(await hashApiKey("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
