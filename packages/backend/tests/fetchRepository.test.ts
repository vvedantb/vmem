import { describe, expect, it } from "vitest";
import { stripTarballRoot } from "../engine/github/fetchRepository";

describe("stripTarballRoot", () => {
  it("removes the GitHub tarball prefix directory", () => {
    expect(stripTarballRoot("vedantb2-eva-abc123/apps/web/src/main.tsx")).toBe(
      "apps/web/src/main.tsx",
    );
  });

  it("returns null when there is no slash", () => {
    expect(stripTarballRoot("root-only")).toBeNull();
  });
});
