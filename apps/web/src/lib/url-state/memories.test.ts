import { describe, expect, it } from "vitest";
import { memoriesSearchParams, memoriesTagsViewRedirectHref } from "./memories";

describe("memoriesTagsViewRedirectHref", () => {
  it("redirects list ?view=tags to the tags route and keeps other params", () => {
    expect(memoriesTagsViewRedirectHref("p1", "?view=tags")).toBe(
      "/p1/memories/tags",
    );
    expect(
      memoriesTagsViewRedirectHref("p1", "q=react&view=tags&kinds=memory"),
    ).toBe("/p1/memories/tags?q=react&kinds=memory");
  });

  it("leaves non-tags list URLs alone", () => {
    expect(memoriesTagsViewRedirectHref("p1", "")).toBeNull();
    expect(memoriesTagsViewRedirectHref("p1", "?q=react")).toBeNull();
    expect(memoriesTagsViewRedirectHref("p1", "?view=memories")).toBeNull();
  });
});

describe("memoriesSearchParams", () => {
  it("does not treat tags as a list view query mode", () => {
    expect(memoriesSearchParams).not.toHaveProperty("view");
  });
});
