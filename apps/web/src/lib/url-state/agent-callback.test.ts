import { describe, expect, it } from "vitest";
import { validateAgentCallbackSearch } from "./agent-callback";

describe("validateAgentCallbackSearch", () => {
  it("keeps a ticket string", () => {
    expect(validateAgentCallbackSearch({ ticket: "tk_abc" })).toEqual({
      ticket: "tk_abc",
    });
  });

  it("defaults missing or non-string tickets to empty", () => {
    expect(validateAgentCallbackSearch({})).toEqual({ ticket: "" });
    expect(validateAgentCallbackSearch({ ticket: 1 })).toEqual({ ticket: "" });
  });
});
