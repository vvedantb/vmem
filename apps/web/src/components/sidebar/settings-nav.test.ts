import { describe, expect, it } from "vitest";
import { settingsNavGroups } from "./nav-config";

describe("settingsNavGroups", () => {
  const hrefs = settingsNavGroups.flatMap((group) =>
    group.items.map((item) => item.href),
  );

  it("lists the extension settings page", () => {
    expect(hrefs).toContain("/settings/extension");
  });

  it("has no secrets or connectors page", () => {
    expect(hrefs).not.toContain("/settings/secrets");
    expect(hrefs).not.toContain("/settings/connectors");
  });
});
