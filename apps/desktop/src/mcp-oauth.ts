import { randomBytes } from "node:crypto";
import {
  auth,
  discoverAuthorizationServerMetadata,
  discoverOAuthServerInfo,
  UnauthorizedError,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";

// vmem sign-in: MCP authorization (OAuth 2.1, PKCE, dynamic client registration)
// against the vmem MCP server, which accepts Clerk OAuth tokens. No Electron
// imports: main supplies the storage, the redirect and the browser.

export const CLIENT_NAME = "vmem";
const SCOPE = "openid profile email";

const tokensSchema = z
  .object({
    access_token: z.string(),
    token_type: z.string(),
    refresh_token: z.string().optional(),
    expires_in: z.number().optional(),
    scope: z.string().optional(),
    id_token: z.string().optional(),
    // Stamped by the SDK: the authorization server these tokens came from.
    issuer: z.string().optional(),
    // Stamped here when the tokens are saved, because `expires_in` is relative.
    obtained_at: z.number().optional(),
  })
  .passthrough();
const clientInformationSchema = z
  .object({
    client_id: z.string(),
    client_secret: z.string().optional(),
    redirect_uris: z.array(z.string()).optional(),
    // Stamped by the SDK: the authorization server this client was registered with.
    issuer: z.string().optional(),
  })
  .passthrough();
const identitySchema = z.object({
  email: z.string().optional(),
  name: z.string().optional(),
});

/** What is kept for the vmem server. Tokens and client carry the `issuer` they belong to. */
export const mcpOAuthStateSchema = z.object({
  tokens: tokensSchema.optional(),
  clientInformation: clientInformationSchema.optional(),
  identity: identitySchema.optional(),
});
export type McpOAuthState = z.infer<typeof mcpOAuthStateSchema>;
export type Identity = z.infer<typeof identitySchema>;

export type McpOAuthStorage = {
  load: () => McpOAuthState | undefined;
  /** undefined clears everything. */
  save: (state: McpOAuthState | undefined) => void;
};

export type McpOAuthProviderOptions = {
  storage: McpOAuthStorage;
  /** Where the browser comes back to. Set only for the interactive sign-in: without it the provider never starts one. */
  redirectUrl?: string;
  /** Opens the authorization URL. Required with redirectUrl. */
  redirectToAuthorization?: (url: URL) => void | Promise<void>;
  now?: () => number;
};

// The SDK reads "no redirect URL" as a client-credentials flow, so a provider that only refreshes still needs one. It is never sent anywhere.
const REFRESH_ONLY_REDIRECT = "http://127.0.0.1/callback";

export type McpOAuthProvider = OAuthClientProvider & {
  /** The `state` sent with the latest authorization request, for the redirect handler to check. */
  readonly pendingState: string | undefined;
};

/** True when tokens are stored, so the app counts as signed in. */
export function hasMcpOAuthTokens(state: McpOAuthState | undefined): boolean {
  return Boolean(state?.tokens?.access_token);
}

const EXPIRY_SKEW_MS = 2 * 60_000;

/** True when the access token has expired or will within two minutes. Unknown expiry counts as live. */
export function isAccessTokenExpiring(
  state: McpOAuthState | undefined,
  now: number,
): boolean {
  const tokens = state?.tokens;
  if (!tokens) return false;
  const { expires_in: expiresIn, obtained_at: obtainedAt } = tokens;
  if (expiresIn === undefined || obtainedAt === undefined) return false;
  return now >= obtainedAt + expiresIn * 1000 - EXPIRY_SKEW_MS;
}

/**
 * An OAuthClientProvider over injected storage. Interactive (redirectUrl set): may register a client and open the browser.
 * Not interactive: only uses what is stored (and refreshes it), so a 401 fails fast and never opens a browser or registers a client.
 */
export function createMcpOAuthProvider(
  options: McpOAuthProviderOptions,
): McpOAuthProvider {
  const { storage, redirectUrl, redirectToAuthorization } = options;
  const now = options.now ?? Date.now;
  const interactive = Boolean(redirectUrl && redirectToAuthorization);
  let verifier: string | undefined;
  let pendingState: string | undefined;

  const update = (patch: Partial<McpOAuthState>): void =>
    storage.save({ ...storage.load(), ...patch });

  const provider: McpOAuthProvider = {
    get redirectUrl() {
      return redirectUrl ?? REFRESH_ONLY_REDIRECT;
    },
    get clientMetadata() {
      return {
        client_name: CLIENT_NAME,
        redirect_uris: redirectUrl ? [redirectUrl] : [],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: SCOPE,
      };
    },
    get pendingState() {
      return pendingState;
    },
    state() {
      pendingState = randomBytes(16).toString("base64url");
      return pendingState;
    },
    clientInformation() {
      const saved = storage.load()?.clientInformation;
      // The loopback port changes on every sign-in, so a client registered for another redirect cannot be reused.
      if (
        interactive &&
        redirectUrl &&
        saved?.redirect_uris &&
        !saved.redirect_uris.includes(redirectUrl)
      )
        return undefined;
      return saved;
    },
    tokens() {
      return storage.load()?.tokens;
    },
    saveTokens(tokens) {
      update({ tokens: { ...tokens, obtained_at: now() } });
    },
    saveCodeVerifier(value) {
      verifier = value;
    },
    codeVerifier() {
      if (!verifier) throw new Error("No code verifier saved");
      return verifier;
    },
    redirectToAuthorization(url) {
      if (!interactive || !redirectToAuthorization)
        throw new UnauthorizedError("Sign in from the vmem settings window");
      return redirectToAuthorization(url);
    },
    invalidateCredentials(scope) {
      if (scope === "all") storage.save(undefined);
      else if (scope === "tokens") update({ tokens: undefined });
      else if (scope === "client") update({ clientInformation: undefined });
      else if (scope === "verifier") verifier = undefined;
    },
  };
  // Without this the SDK cannot register a client, so a non-interactive 401 stops before any registration request.
  if (interactive) {
    provider.saveClientInformation = (info) => {
      const parsed = clientInformationSchema.parse(info);
      update({
        clientInformation: {
          ...parsed,
          redirect_uris:
            parsed.redirect_uris ?? (redirectUrl ? [redirectUrl] : undefined),
        },
      });
    };
  }
  return provider;
}

/**
 * Signs in. The SDK finds the protected resource metadata (RFC 9728) and the authorization server, registers a client and
 * calls redirectToAuthorization. Then `code` is awaited and exchanged. Resolves once tokens are saved.
 */
export async function authorizeMcpServer(args: {
  url: string;
  provider: McpOAuthProvider;
  /** The authorization code from the redirect. Created before the browser opens; it may reject (cancelled, timed out). */
  code: Promise<string>;
  fetch?: FetchLike;
}): Promise<void> {
  // A rejection that arrives before we await it must not surface as unhandled.
  args.code.catch(() => undefined);
  const options = { serverUrl: args.url, scope: SCOPE, fetchFn: args.fetch };
  const first = await auth(args.provider, options);
  if (first === "AUTHORIZED") return;
  const authorizationCode = await args.code;
  const second = await auth(args.provider, { ...options, authorizationCode });
  if (second !== "AUTHORIZED") throw new Error("Sign-in did not finish");
}

/**
 * Refreshes the access token with the stored refresh token. Never opens a browser. Returns false when the
 * refresh did not work (the SDK has then cleared tokens that the server rejected).
 */
export async function refreshMcpOAuth(args: {
  url: string;
  provider: McpOAuthProvider;
  fetch?: FetchLike;
}): Promise<boolean> {
  try {
    const result = await auth(args.provider, {
      serverUrl: args.url,
      fetchFn: args.fetch,
    });
    return result === "AUTHORIZED";
  } catch {
    return false;
  }
}

// Sign out waits for this at most: a slow authorization server must not hold it up.
const REVOKE_TIMEOUT_MS = 3000;

const revocationMetadataSchema = z
  .object({
    revocation_endpoint: z.string().optional(),
  })
  .passthrough();

/**
 * Best-effort token revocation (RFC 7009) before the local tokens are cleared. Only when the authorization server advertises a
 * `revocation_endpoint`. Never opens a browser and never throws: a missing endpoint, a network error or a 4xx/5xx is ignored.
 * Returns true when at least one token was revoked.
 */
export async function revokeMcpOAuth(args: {
  url: string;
  state: McpOAuthState | undefined;
  fetch?: FetchLike;
}): Promise<boolean> {
  const { tokens, clientInformation } = args.state ?? {};
  if (!tokens?.access_token) return false;
  const signal = AbortSignal.timeout(REVOKE_TIMEOUT_MS);
  const fetchFn: FetchLike = (input, init) =>
    (args.fetch ?? fetch)(input, { ...init, signal });
  try {
    // The stored issuer is the server the tokens came from; without one, discover it from the MCP server.
    const issuer = tokens.issuer ?? clientInformation?.issuer;
    const metadata = issuer
      ? await discoverAuthorizationServerMetadata(issuer, { fetchFn })
      : (await discoverOAuthServerInfo(args.url, { fetchFn }))
          .authorizationServerMetadata;
    const endpoint =
      revocationMetadataSchema.parse(metadata).revocation_endpoint;
    if (!endpoint) return false;
    const revoke = async (token: string, hint: string): Promise<boolean> => {
      const body = new URLSearchParams({ token, token_type_hint: hint });
      if (clientInformation?.client_id)
        body.set("client_id", clientInformation.client_id);
      if (clientInformation?.client_secret)
        body.set("client_secret", clientInformation.client_secret);
      const response = await fetchFn(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      return response.ok;
    };
    // The refresh token first: revoking it may also end the access token, and it is the longer-lived one.
    const outcomes = await Promise.all(
      [
        ...(tokens.refresh_token
          ? [revoke(tokens.refresh_token, "refresh_token")]
          : []),
        revoke(tokens.access_token, "access_token"),
      ].map((work) => work.catch(() => false)),
    );
    return outcomes.some(Boolean);
  } catch {
    return false;
  }
}
