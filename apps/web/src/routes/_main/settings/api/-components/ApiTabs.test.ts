import { describe, expect, it } from "vitest";
import { apiTabFromPathname } from "./ApiTabs";

describe("apiTabFromPathname", () => {
  it("selects keys from the keys path, including a trailing slash", () => {
    expect(apiTabFromPathname("/settings/api/keys")).toBe("keys");
    expect(apiTabFromPathname("/settings/api/keys/")).toBe("keys");
  });

  it("selects usage for the usage tab and the api index", () => {
    expect(apiTabFromPathname("/settings/api/usage")).toBe("usage");
    expect(apiTabFromPathname("/settings/api")).toBe("usage");
  });
});
