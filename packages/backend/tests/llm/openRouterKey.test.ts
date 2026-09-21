import { describe, expect, it } from "vitest";
import { readOpenRouterApiKey } from "../../convex/lib/openRouterKey";

describe("readOpenRouterApiKey", () => {
  it("reads a trimmed Convex deployment env value", () => {
    expect(readOpenRouterApiKey({ OPENROUTER_API_KEY: "  sk-or-test  " })).toBe(
      "sk-or-test",
    );
  });

  it("returns undefined when the deployment key is missing or blank", () => {
    expect(readOpenRouterApiKey({})).toBeUndefined();
    expect(readOpenRouterApiKey({ OPENROUTER_API_KEY: "   " })).toBeUndefined();
  });
});
