import { describe, expect, it } from "vitest";
import { extractBearerToken } from "./bearerToken";

describe("extractBearerToken", () => {
  it("returns null when the header is missing or malformed", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Token abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer token extra")).toBeNull();
  });

  it("returns the token for a valid Bearer header", () => {
    expect(extractBearerToken("Bearer vmem_sk_test")).toBe("vmem_sk_test");
    expect(extractBearerToken("bearer vmem_sk_test")).toBe("vmem_sk_test");
  });
});
