import { describe, expect, it } from "vitest";
import { readOpenRouterApiKey } from "../../convex/lib/openRouterKey";

describe("readOpenRouterApiKey", () => {
  it("reads a trimmed AI_GATEWAY_API_KEY", () => {
    expect(readOpenRouterApiKey({ AI_GATEWAY_API_KEY: "  gw-test  " })).toBe(
      "gw-test",
    );
  });

  it("ignores a leftover OPENROUTER_API_KEY", () => {
    expect(
      readOpenRouterApiKey({ OPENROUTER_API_KEY: "sk-or-test" }),
    ).toBeUndefined();
  });

  it("returns undefined when the deployment key is missing or blank", () => {
    expect(readOpenRouterApiKey({})).toBeUndefined();
    expect(readOpenRouterApiKey({ AI_GATEWAY_API_KEY: "   " })).toBeUndefined();
  });
});
