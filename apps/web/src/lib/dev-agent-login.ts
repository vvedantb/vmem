import { z } from "zod";

const clerkSignInTokenSchema = z.object({
  token: z.string(),
});

export const AGENT_LOGIN_PATH = "/api/auth/agent-login";

const missingEnvError =
  "CLERK_SECRET_KEY and AGENT_CLERK_USER_ID must be set in .env.local";

type AgentLoginResult =
  | { kind: "redirect"; location: string }
  | {
      kind: "error";
      status: 500 | 502;
      body: { error: string; details?: string };
    };

export async function createAgentLoginResult(input: {
  secretKey: string | undefined;
  agentUserId: string | undefined;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}): Promise<AgentLoginResult> {
  const { secretKey, agentUserId } = input;
  const fetchImpl = input.fetchImpl ?? fetch;

  if (!secretKey || !agentUserId) {
    return {
      kind: "error",
      status: 500,
      body: { error: missingEnvError },
    };
  }

  const resp = await fetchImpl("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: agentUserId,
      expires_in_seconds: 60,
    }),
  });

  if (!resp.ok) {
    return {
      kind: "error",
      status: 502,
      body: {
        error: "Failed to create sign-in token",
        details: await resp.text(),
      },
    };
  }

  const parsed = clerkSignInTokenSchema.safeParse(await resp.json());
  if (!parsed.success) {
    return {
      kind: "error",
      status: 502,
      body: { error: "No token in Clerk response" },
    };
  }

  return {
    kind: "redirect",
    location: `/agent-callback?ticket=${encodeURIComponent(parsed.data.token)}`,
  };
}
