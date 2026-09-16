import { describe, expect, it } from "vitest";
import { landingSearchSchema } from "./landing";

describe("landingSearchSchema", () => {
  it("treats a bare ?agent flag as true", () => {
    expect(landingSearchSchema.parse({ agent: "" })).toEqual({ agent: true });
  });

  it("accepts boolean true from JSON-parsed ?agent=true", () => {
    expect(landingSearchSchema.parse({ agent: true })).toEqual({ agent: true });
  });

  it("omits the flag when it is absent or false", () => {
    expect(landingSearchSchema.parse({})).toEqual({ agent: undefined });
    expect(landingSearchSchema.parse({ agent: false })).toEqual({
      agent: undefined,
    });
  });
});
