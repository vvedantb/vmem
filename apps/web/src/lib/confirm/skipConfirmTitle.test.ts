import { describe, expect, it } from "vitest";
import { skipConfirmTitle } from "@vvedantb/app-kit";

describe("skipConfirmTitle", () => {
  it("names the Alt-click skip, with an optional action label", () => {
    expect(skipConfirmTitle()).toMatch(/-click skips confirmation$/);
    expect(skipConfirmTitle("Delete")).toMatch(
      /^Delete · .+click skips confirmation$/,
    );
  });
});
