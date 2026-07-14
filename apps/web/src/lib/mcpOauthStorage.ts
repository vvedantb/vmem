import { z } from "zod";

// persist mcp oauth params across clerk popup redirects (sessionStorage)

const STORAGE_KEY = "mcp_oauth_pending";
const MAX_ATTEMPTS = 2;

export const mcpOauthParamsSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  state: z.string(),
  code_challenge: z.string(),
  code_challenge_method: z.string(),
});

export type McpOauthParams = z.infer<typeof mcpOauthParamsSchema>;

const stateSchema = z.object({
  params: mcpOauthParamsSchema,
  attempts: z.number(),
});

type StoredState = z.infer<typeof stateSchema>;

function readState(): StoredState | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// save oauth params; keep attempt count for same state nonce
export function saveMcpOauthParams(params: McpOauthParams): void {
  const existing = readState();
  const attempts =
    existing !== null && existing.params.state === params.state
      ? existing.attempts
      : 0;
  const next: StoredState = { params, attempts };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

// parse oauth params from url before clerk mounts (survives handshake redirect)
export function saveMcpOauthParamsFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.pathname !== "/mcp/oauth/authorize") return;

  const candidate = {
    client_id: url.searchParams.get("client_id"),
    redirect_uri: url.searchParams.get("redirect_uri"),
    state: url.searchParams.get("state"),
    code_challenge: url.searchParams.get("code_challenge"),
    code_challenge_method: url.searchParams.get("code_challenge_method"),
  };

  const parsed = mcpOauthParamsSchema.safeParse(candidate);
  if (!parsed.success) return;

  saveMcpOauthParams(parsed.data);
}

// consume pending oauth params; null after max attempts (loop guard)
export function consumeMcpOauthParams(): McpOauthParams | null {
  const state = readState();
  if (!state) return null;
  if (state.attempts >= MAX_ATTEMPTS) {
    clearMcpOauthParams();
    return null;
  }
  const next: StoredState = {
    params: state.params,
    attempts: state.attempts + 1,
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return state.params;
}

export function clearMcpOauthParams(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
