import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Doc, Id, TableNames } from "@vmem/backend";
import { ActiveProfileProvider, useActiveProfile } from "./active-profile";

function optimisticId<TableName extends TableNames>(
  tableName: TableName,
  id: string,
): Id<TableName> {
  return Object.assign(id, { __tableName: tableName });
}

function testProfile(): Doc<"profiles"> {
  return {
    _id: optimisticId("profiles", "00000000-0000-4000-8000-00000000000a"),
    _creationTime: 0,
    userId: optimisticId("users", "00000000-0000-4000-8000-00000000000b"),
    name: "Personal",
    color: "#3B82F6",
    icon: "briefcase",
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

function ProfileName() {
  return <span>{useActiveProfile().name}</span>;
}

describe("useActiveProfile", () => {
  it("returns the layout-provided profile without re-querying Convex", () => {
    const profile = testProfile();
    const html = renderToStaticMarkup(
      <ActiveProfileProvider profile={profile}>
        <ProfileName />
      </ActiveProfileProvider>,
    );
    expect(html).toContain("Personal");
  });

  it("throws only when used outside the workspace provider", () => {
    expect(() => renderToStaticMarkup(<ProfileName />)).toThrow(
      /must be used inside the \$profileId workspace route/,
    );
  });

  it("does not throw while a Convex profiles.list subscription is still loading", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "active-profile.tsx"),
      "utf8",
    );
    expect(source).not.toContain("Active profile is loading");
    expect(source).not.toContain("Active profile not found");
  });
});
