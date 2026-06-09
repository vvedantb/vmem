import { describe, expect, it } from "vitest";
import {
  encodeGithubContentPath,
  stripTarballRoot,
} from "../engine/github/fetchRepository";

describe("encodeGithubContentPath", () => {
  it("encodes TanStack route params with $", () => {
    expect(
      encodeGithubContentPath("apps/web/src/routes/_global/setup/$id.tsx"),
    ).toBe("apps/web/src/routes/_global/setup/%24id.tsx");
  });

  it("encodes spaces and leaves plain segments unchanged", () => {
    expect(encodeGithubContentPath("src/foo bar/baz.ts")).toBe(
      "src/foo%20bar/baz.ts",
    );
  });
});

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
