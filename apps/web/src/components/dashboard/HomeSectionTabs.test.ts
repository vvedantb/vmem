import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourcesTabFromPathname } from "./HomeSectionTabs";

const here = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(path.join(here, rel), "utf8");
}

const routes = "../../routes/_main/$profileId";

describe("nested sources tabs", () => {
  it("selects connectors unless on import", () => {
    expect(sourcesTabFromPathname("/p1/sources/connectors")).toBe("connectors");
    expect(sourcesTabFromPathname("/p1/sources")).toBe("connectors");
    expect(sourcesTabFromPathname("/p1/sources/import")).toBe("import");
  });
});

describe("page tabs replace the sources sidebar", () => {
  it("labels only the nested tabs", () => {
    const tabs = read("HomeSectionTabs.tsx");
    for (const label of ['label: "Connectors"', 'label: "Import"']) {
      expect(tabs).toContain(label);
    }
    for (const label of [
      'label: "Dashboard"',
      'label: "Inbox"',
      'label: "Sources"',
      'label: "Proposals"',
      'label: "Notifications"',
    ]) {
      expect(tabs).not.toContain(label);
    }
    expect(tabs).not.toContain("HomeSectionTabRows");
    expect(tabs).toContain("RouteTabs");
    expect(tabs).not.toContain('"/$profileId/home"');
    expect(tabs).not.toContain("InboxTabs");
    expect(tabs).not.toContain('"/$profileId/inbox/');
    expect(tabs).toContain('"/$profileId/sources/connectors"');
    expect(tabs).toContain('"/$profileId/sources/import"');
  });

  it("renders nested tabs on sources, and none on home or inbox", () => {
    const home = read(`${routes}/home.tsx`);
    expect(home).toContain('title="Dashboard"');
    expect(home).not.toContain("tabs=");
    expect(home).not.toContain("HomeSectionTabs");

    const inbox = read(`${routes}/inbox/route.tsx`);
    expect(inbox).toContain('title="Inbox"');
    expect(inbox).not.toContain("tabs=");
    expect(inbox).toContain("<NotificationsRightSection />");
    expect(inbox).not.toContain("ProposalsRightSection");
    expect(() =>
      read(`${routes}/inbox/-components/ProposalsPanel.tsx`),
    ).toThrow();

    const connectors = read(`${routes}/sources/connectors.tsx`);
    expect(connectors).toContain("tabs={<SourcesTabs />}");
    const importPage = read(`${routes}/sources/import.tsx`);
    expect(importPage).toContain('title="Sources"');
    expect(importPage).toContain("tabs={<SourcesTabs />}");
    expect(read("../settings/ConnectorsClient.tsx")).toContain("tabs={tabs}");
  });

  it("lands the inbox index on notifications and sends proposals to dreaming", () => {
    expect(read(`${routes}/inbox/index.tsx`)).toContain(
      '"/$profileId/inbox/notifications"',
    );
    for (const legacy of ["inbox/proposals.tsx", "proposals.tsx"]) {
      const route = read(`${routes}/${legacy}`);
      expect(route).toContain("throw redirect(");
      expect(route).toContain('to: "/$profileId/dreaming"');
    }
    expect(read(`${routes}/sources/index.tsx`)).toContain(
      '"/$profileId/sources/connectors"',
    );
    expect(read("../../routes/_main/settings/connectors.tsx")).toContain(
      'subPath="/sources/connectors"',
    );
  });
});
