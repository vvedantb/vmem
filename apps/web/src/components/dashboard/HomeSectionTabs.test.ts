import { describe, expect, it } from "vitest";
import { sourcesTabFromPathname } from "./HomeSectionTabs";

describe("nested sources tabs", () => {
  it("selects connectors unless on import", () => {
    expect(sourcesTabFromPathname("/p1/sources/connectors")).toBe("connectors");
    expect(sourcesTabFromPathname("/p1/sources")).toBe("connectors");
    expect(sourcesTabFromPathname("/p1/sources/import")).toBe("import");
  });
});
