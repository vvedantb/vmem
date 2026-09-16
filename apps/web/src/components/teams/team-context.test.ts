import { createElement } from "react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Id, TableNames } from "@vmem/backend";
import {
  TeamDetailProvider,
  useTeamWorkspace,
  type TeamDetail,
} from "./team-context";

function optimisticId<TableName extends TableNames>(
  tableName: TableName,
  id: string,
): Id<TableName> {
  return Object.assign(id, { __tableName: tableName });
}

function testDetail(): TeamDetail {
  const userId = optimisticId("users", "00000000-0000-4000-8000-00000000000b");
  return {
    team: {
      _id: optimisticId("teams", "00000000-0000-4000-8000-00000000000c"),
      _creationTime: 0,
      name: "Acme",
      createdBy: userId,
      createdAt: 0,
      updatedAt: 0,
    },
    role: "owner",
    profile: null,
    members: [],
  };
}

function TeamName() {
  return createElement("span", null, useTeamWorkspace().detail.team.name);
}

describe("useTeamWorkspace", () => {
  it("returns the layout-provided team detail without re-querying Convex", () => {
    const html = renderToStaticMarkup(
      createElement(
        TeamDetailProvider,
        { detail: testDetail() },
        createElement(TeamName),
      ),
    );
    expect(html).toContain("Acme");
  });

  it("throws only when used outside TeamDetailProvider", () => {
    expect(() => renderToStaticMarkup(createElement(TeamName))).toThrow(
      /must be used within TeamDetailProvider/,
    );
  });

  it("does not throw while a Convex teams.get subscription is still loading", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "team-context.tsx"),
      "utf8",
    );
    expect(source).not.toContain("Team detail is loading");
    expect(source).not.toContain("Team not found");
  });
});
