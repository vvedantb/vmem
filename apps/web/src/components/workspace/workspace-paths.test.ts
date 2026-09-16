import { describe, expect, it } from "vitest";
import { workspacePathFor } from "./workspace-paths";

describe("workspacePathFor", () => {
  it("sends user-level routes including /agent-callback to the target home", () => {
    expect(workspacePathFor("/agent-callback", "p1", false)).toBe("/p1/home");
    expect(workspacePathFor("/settings/api", "p1", true)).toBe("/p1/home");
    expect(workspacePathFor("/home", "p1", false)).toBe("/p1/home");
  });

  it("keeps workspace-relative memory list paths", () => {
    expect(workspacePathFor("/old/memories/list/mem_1", "p1", false)).toBe(
      "/p1/memories/list",
    );
  });
});
