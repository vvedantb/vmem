import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  homeSectionTabFromPathname,
  inboxTabFromPathname,
  sourcesTabFromPathname,
} from "./HomeSectionTabs";

const here = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(path.join(here, rel), "utf8");
}

const routes = "../../routes/_main/$profileId";

describe("homeSectionTabFromPathname", () => {
  it("selects the section from the workspace path", () => {
    expect(homeSectionTabFromPathname("/p1/home")).toBe("dashboard");
    expect(homeSectionTabFromPathname("/p1/inbox")).toBe("inbox");
    expect(homeSectionTabFromPathname("/p1/inbox/proposals")).toBe("inbox");
    expect(homeSectionTabFromPathname("/p1/inbox/notifications")).toBe("inbox");
    expect(homeSectionTabFromPathname("/p1/sources")).toBe("sources");
    expect(homeSectionTabFromPathname("/p1/sources/import")).toBe("sources");
    expect(homeSectionTabFromPathname("/p1/inboxes")).toBe("dashboard");
  });
});

describe("nested inbox and sources tabs", () => {
  it("selects proposals unless on notifications", () => {
    expect(inboxTabFromPathname("/p1/inbox/proposals")).toBe("proposals");
    expect(inboxTabFromPathname("/p1/inbox")).toBe("proposals");
    expect(inboxTabFromPathname("/p1/inbox/notifications")).toBe(
      "notifications",
    );
    expect(inboxTabFromPathname("/p1/inbox/notifications/")).toBe(
      "notifications",
    );
  });

  it("selects connectors unless on import", () => {
    expect(sourcesTabFromPathname("/p1/sources/connectors")).toBe("connectors");
    expect(sourcesTabFromPathname("/p1/sources")).toBe("connectors");
    expect(sourcesTabFromPathname("/p1/sources/import")).toBe("import");
  });
});

describe("page tabs replace the inbox and sources sidebars", () => {
  it("labels the section and nested tabs", () => {
    const tabs = read("HomeSectionTabs.tsx");
    for (const label of [
      'label: "Dashboard"',
      'label: "Inbox"',
      'label: "Sources"',
      'label: "Proposals"',
      'label: "Notifications"',
      'label: "Connectors"',
      'label: "Import"',
    ]) {
      expect(tabs).toContain(label);
    }
    expect(tabs).toContain("RouteTabs");
    expect(tabs).toContain('"/$profileId/home"');
    expect(tabs).toContain('"/$profileId/inbox/proposals"');
    expect(tabs).toContain('"/$profileId/inbox/notifications"');
    expect(tabs).toContain('"/$profileId/sources/connectors"');
    expect(tabs).toContain('"/$profileId/sources/import"');
  });

  it("renders the tabs under the title on home, inbox, and sources pages", () => {
    const home = read(`${routes}/home.tsx`);
    expect(home).toContain("tabs={<HomeSectionTabRows />}");

    const inbox = read(`${routes}/inbox/route.tsx`);
    expect(inbox).toContain(
      "tabs={<HomeSectionTabRows nested={<InboxTabs />} />}",
    );

    const connectors = read(`${routes}/sources/connectors.tsx`);
    expect(connectors).toContain(
      "tabs={<HomeSectionTabRows nested={<SourcesTabs />} />}",
    );
    const importPage = read(`${routes}/sources/import.tsx`);
    expect(importPage).toContain(
      "tabs={<HomeSectionTabRows nested={<SourcesTabs />} />}",
    );
    expect(read("../settings/ConnectorsClient.tsx")).toContain("tabs={tabs}");
  });

  it("keeps the index redirects for inbox and sources", () => {
    expect(read(`${routes}/inbox/index.tsx`)).toContain(
      '"/$profileId/inbox/proposals"',
    );
    expect(read(`${routes}/sources/index.tsx`)).toContain(
      '"/$profileId/sources/connectors"',
    );
    expect(read("../../routes/_main/settings/connectors.tsx")).toContain(
      'subPath="/sources/connectors"',
    );
  });
});
