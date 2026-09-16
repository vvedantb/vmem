import { describe, expect, it, vi } from "vitest";
import { AGENT_LOGIN_PATH, createAgentLoginResult } from "./dev-agent-login";

describe("createAgentLoginResult", () => {
  it("returns 500 when Clerk env is missing", async () => {
    const result = await createAgentLoginResult({
      secretKey: undefined,
      agentUserId: "user_agent",
    });

    expect(result).toEqual({
      kind: "error",
      status: 500,
      body: {
        error:
          "CLERK_SECRET_KEY and AGENT_CLERK_USER_ID must be set in .env.local",
      },
    });
  });

  it("returns 502 when Clerk rejects the token request", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("invalid user", { status: 404 }),
    );

    const result = await createAgentLoginResult({
      secretKey: "sk_test",
      agentUserId: "user_agent",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.clerk.com/v1/sign_in_tokens",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result).toEqual({
      kind: "error",
      status: 502,
      body: {
        error: "Failed to create sign-in token",
        details: "invalid user",
      },
    });
  });

  it("redirects to /agent-callback with the Clerk ticket", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ token: "tk_hello/world" }), {
          status: 200,
        }),
    );

    const result = await createAgentLoginResult({
      secretKey: "sk_test",
      agentUserId: "user_agent",
      fetchImpl,
    });

    expect(result).toEqual({
      kind: "redirect",
      location: "/agent-callback?ticket=tk_hello%2Fworld",
    });
    expect(AGENT_LOGIN_PATH).toBe("/api/auth/agent-login");
  });

  it("returns 502 when Clerk omits the token", async () => {
    const result = await createAgentLoginResult({
      secretKey: "sk_test",
      agentUserId: "user_agent",
      fetchImpl: async () =>
        new Response(JSON.stringify({ object: "sign_in_token" }), {
          status: 200,
        }),
    });

    expect(result).toEqual({
      kind: "error",
      status: 502,
      body: { error: "No token in Clerk response" },
    });
  });
});
