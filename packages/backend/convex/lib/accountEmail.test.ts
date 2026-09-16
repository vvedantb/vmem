import { describe, expect, it } from "vitest";
import { normalizeAccountEmail } from "./accountEmail";

describe("normalizeAccountEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeAccountEmail("  Eva@VedantB.com ")).toBe("eva@vedantb.com");
  });

  it("treats empty as missing", () => {
    expect(normalizeAccountEmail("   ")).toBeUndefined();
    expect(normalizeAccountEmail(undefined)).toBeUndefined();
    expect(normalizeAccountEmail(null)).toBeUndefined();
  });
});
