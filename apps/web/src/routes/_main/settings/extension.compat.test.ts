// AI-generated (Claude), prompt: "vitest that settings/extension stays in nav without codebase prompts"
// Modified by me: auto-sync and selection-popup switches
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { settingsNavGroups } from "@/components/sidebar/nav-config";

const here = path.dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(
  path.join(here, "../../../components/settings/ExtensionSettingsClient.tsx"),
  "utf8",
);

describe("/settings/extension compatibility", () => {
  it("is linked from settings nav", () => {
    const hrefs = settingsNavGroups.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(hrefs).toContain("/settings/extension");
  });

  it("exposes extension auto-sync and selection popup, not codebase prompts", () => {
    expect(pageSource).toContain("extensionAutoSyncEnabled");
    expect(pageSource).toContain("extensionSelectionPopupEnabled");
    expect(pageSource.toLowerCase()).not.toMatch(/codebase/);
  });
});
