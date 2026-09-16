import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { settingsNavGroups } from "@/components/sidebar/nav-config";

const here = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(path.join(here, rel), "utf8");
}

describe("settings chrome mirrors Eva", () => {
  it("exposes the vmem settings surfaces in the sidebar", () => {
    const hrefs = settingsNavGroups.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/settings/preferences",
        "/settings/profiles",
        "/settings/api",
        "/settings/secrets",
        "/settings/connectors",
        "/settings/extension",
        "/settings/data-controls",
      ]),
    );
  });

  it("keeps SettingsPage / SettingsSection / SettingsSidebar as the chrome", () => {
    expect(read("../sidebar/SettingsSidebar.tsx")).toContain(
      'layoutId="settings-nav"',
    );
    expect(read("SettingsPage.tsx")).toContain("insetHeader");
    expect(read("SettingsSection.tsx")).toContain('bodyVariant = "form"');
    expect(read("SettingsToggleRow.tsx")).toContain("min-h-10");
  });

  it("routes settings pages through SettingsPage", () => {
    const sources = [
      read("preferences/PreferencesPage.tsx"),
      read("ExtensionSettingsClient.tsx"),
      read("SecretsClient.tsx"),
      read("ConnectorsClient.tsx"),
      read("../profiles/ProfilesPage.tsx"),
    ];
    for (const source of sources) {
      expect(source).toContain("SettingsPage");
      expect(source).not.toMatch(/<PageContainer/);
    }
  });
});
