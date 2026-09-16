import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Id, TableNames } from "@vmem/backend";
import { ProfileCard } from "./ProfileCard";

function optimisticId<TableName extends TableNames>(
  tableName: TableName,
  id: string,
): Id<TableName> {
  return Object.assign(id, { __tableName: tableName });
}

const personal = {
  _id: optimisticId("profiles", "00000000-0000-4000-8000-000000000001"),
  _creationTime: 0,
  userId: optimisticId("users", "00000000-0000-4000-8000-000000000002"),
  name: "Personal",
  color: "#171717",
  icon: "user",
  isDefault: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe("ProfileCard team sharing", () => {
  it("shows a Team badge and hides edit/delete when those handlers are omitted", () => {
    const html = renderToStaticMarkup(
      <ProfileCard
        profile={{
          ...personal,
          name: "Acme",
          isDefault: false,
          teamId: optimisticId("teams", "00000000-0000-4000-8000-000000000003"),
        }}
      />,
    );
    expect(html).toContain("Team");
    expect(html).not.toContain("Edit Acme");
    expect(html).not.toContain("Delete Acme");
  });

  it("keeps edit/delete on personal profiles", () => {
    const html = renderToStaticMarkup(
      <ProfileCard
        profile={{ ...personal, isDefault: false, name: "Work" }}
        onEdit={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(html).toContain("Edit Work");
    expect(html).toContain("Delete Work");
    expect(html).not.toContain(">Team<");
  });
});
