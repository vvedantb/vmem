import { describe, expect, it } from "vitest";
import {
  isOpenRouterRequiredError,
  OPENROUTER_REQUIRED,
  OpenRouterRequiredError,
  openRouterRequiredResponse,
} from "../../engine/memory/openRouterRequired";

describe("openRouterRequired", () => {
  it("identifies the gate error and returns HTTP 422", async () => {
    const error = new OpenRouterRequiredError();
    expect(error.message).toBe(OPENROUTER_REQUIRED);
    expect(isOpenRouterRequiredError(error)).toBe(true);
    expect(isOpenRouterRequiredError(new Error(OPENROUTER_REQUIRED))).toBe(
      true,
    );
    expect(isOpenRouterRequiredError(new Error("nope"))).toBe(false);

    const response = openRouterRequiredResponse();
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: OPENROUTER_REQUIRED });
  });
});
