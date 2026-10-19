// Pins the t3-env client env rules: url, pk_ prefix, empty string as missing.
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnv(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  vi.resetModules();
  return (await import("./env")).env;
}

describe("env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses a valid url and publishable key", async () => {
    const env = await loadEnv({
      VITE_CONVEX_URL: "https://pin-test.convex.cloud",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_pin",
    });
    expect(env.VITE_CONVEX_URL).toBe("https://pin-test.convex.cloud");
    expect(env.VITE_CLERK_PUBLISHABLE_KEY).toBe("pk_test_pin");
  });

  it.each([
    { VITE_CONVEX_URL: "", VITE_CLERK_PUBLISHABLE_KEY: "pk_test_pin" },
    { VITE_CONVEX_URL: "not a url", VITE_CLERK_PUBLISHABLE_KEY: "pk_test_pin" },
    {
      VITE_CONVEX_URL: "https://pin-test.convex.cloud",
      VITE_CLERK_PUBLISHABLE_KEY: "sk_test_pin",
    },
    {
      VITE_CONVEX_URL: "https://pin-test.convex.cloud",
      VITE_CLERK_PUBLISHABLE_KEY: "",
    },
  ])("throws 'Invalid environment variables' for %o", async (values) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadEnv(values)).rejects.toThrow(
      "Invalid environment variables",
    );
    expect(errors).toHaveBeenCalledWith(
      "❌ Invalid environment variables:",
      expect.any(Array),
    );
    errors.mockRestore();
  });
});
