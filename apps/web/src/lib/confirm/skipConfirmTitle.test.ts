import { describe, expect, it } from "vitest";
import { skipConfirmTitle } from "./ConfirmSkipHint";

describe("skipConfirmTitle", () => {
  it("names the Alt-click skip, with an optional action label", () => {
    expect(skipConfirmTitle()).toMatch(/-click skips confirmation$/);
    expect(skipConfirmTitle("Delete")).toMatch(
      /^Delete · .+click skips confirmation$/,
    );
  });
});
