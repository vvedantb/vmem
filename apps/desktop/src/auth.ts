import { discoverOAuthServerInfo } from "@modelcontextprotocol/sdk/client/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import {
  authorizeMcpServer,
  createMcpOAuthProvider,
  hasMcpOAuthTokens,
  isAccessTokenExpiring,
  refreshMcpOAuth,
  revokeMcpOAuth,
  type Identity,
  type McpOAuthStorage,
} from "./mcp-oauth";
import { startLoopback } from "./mcp-oauth-loopback";

const claimsSchema = z
  .object({
    email: z.string().optional(),
    name: z.string().optional(),
    given_name: z.string().optional(),
    family_name: z.string().optional(),
  })
  .passthrough();

function identityFromClaims(claims: z.infer<typeof claimsSchema>): Identity {
  const name =
    claims.name ??
    ([claims.given_name, claims.family_name].filter(Boolean).join(" ") ||
      undefined);
  return { email: claims.email, name };
}

/** Reads email and name from the id_token payload. The signature is not checked: the token came from the token endpoint over TLS. */
export function identityFromIdToken(idToken: string): Identity | undefined {
  try {
    const payload = Buffer.from(idToken.split(".")[1] ?? "", "base64url");
    return identityFromClaims(
      claimsSchema.parse(JSON.parse(payload.toString("utf8"))),
    );
  } catch {
    return undefined;
  }
}

const userinfoMetadataSchema = z
  .object({
    userinfo_endpoint: z.string().optional(),
  })
  .passthrough();

export interface AuthDeps {
  storage: McpOAuthStorage;
  /** The vmem MCP URL, for example https://<deployment>.convex.site/mcp. It is the OAuth resource. */
  mcpUrl: string;
  /** Opens the authorization URL in the system browser. */
  openExternal: (url: string) => Promise<void>;
  /** Clears the API key that an older install saved. */
  dropLegacyApiKey: () => void;
  fetch?: FetchLike;
  now?: () => number;
}

/** Clerk sign-in through the vmem MCP OAuth flow. Tokens live in `storage`. */
export class AuthService {
  private signingIn: Promise<void> | null = null;
  private refreshing: Promise<boolean> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: AuthDeps) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isSignedIn(): boolean {
    return hasMcpOAuthTokens(this.deps.storage.load());
  }

  isSigningIn(): boolean {
    return this.signingIn !== null;
  }

  identity(): Identity | undefined {
    return this.deps.storage.load()?.identity;
  }

  /** The stored access token, which may have expired. Use it to check for sign-in. */
  currentAccessToken(): string | null {
    return this.deps.storage.load()?.tokens?.access_token ?? null;
  }

  /** The access token, refreshed first when it has expired or is about to. Null when it cannot be refreshed. */
  async freshAccessToken(): Promise<string | null> {
    const state = this.deps.storage.load();
    if (!hasMcpOAuthTokens(state)) return null;
    if (isAccessTokenExpiring(state, this.now())) {
      this.refreshing ??= refreshMcpOAuth({
        url: this.deps.mcpUrl,
        provider: createMcpOAuthProvider({
          storage: this.deps.storage,
          now: this.deps.now,
        }),
        fetch: this.deps.fetch,
      }).finally(() => {
        this.refreshing = null;
        this.notify();
      });
      if (!(await this.refreshing)) return null;
    }
    return this.currentAccessToken();
  }

  /** Opens the browser and waits for the user. One sign-in at a time; callers share the run. */
  signIn(): Promise<void> {
    this.signingIn ??= this.runSignIn().finally(() => {
      this.signingIn = null;
      this.notify();
    });
    this.notify();
    return this.signingIn;
  }

  async signOut(): Promise<void> {
    await revokeMcpOAuth({
      url: this.deps.mcpUrl,
      state: this.deps.storage.load(),
      fetch: this.deps.fetch,
    });
    this.deps.storage.save(undefined);
    this.deps.dropLegacyApiKey();
    this.notify();
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private async runSignIn(): Promise<void> {
    const loopback = await startLoopback();
    try {
      const provider = createMcpOAuthProvider({
        storage: this.deps.storage,
        redirectUrl: loopback.redirectUrl,
        redirectToAuthorization: (url) =>
          this.deps.openExternal(url.toString()),
        now: this.deps.now,
      });
      const code = loopback.waitForCode(() => provider.pendingState);
      await authorizeMcpServer({
        url: this.deps.mcpUrl,
        provider,
        code,
        fetch: this.deps.fetch,
      });
    } finally {
      loopback.close();
    }
    // The key an older install saved is dead weight from here on.
    this.deps.dropLegacyApiKey();
    await this.saveIdentity();
  }

  /** Name and email for the settings window. Failure is not fatal: the window then shows "Signed in". */
  private async saveIdentity(): Promise<void> {
    const state = this.deps.storage.load();
    const tokens = state?.tokens;
    if (!state || !tokens) return;
    const fromToken = tokens.id_token
      ? identityFromIdToken(tokens.id_token)
      : undefined;
    const identity =
      fromToken?.email || fromToken?.name
        ? fromToken
        : await this.fetchUserinfo(tokens.access_token);
    if (identity) this.deps.storage.save({ ...state, identity });
  }

  private async fetchUserinfo(
    accessToken: string,
  ): Promise<Identity | undefined> {
    const fetchFn = this.deps.fetch ?? fetch;
    try {
      const { authorizationServerMetadata } = await discoverOAuthServerInfo(
        this.deps.mcpUrl,
        { fetchFn },
      );
      const endpoint = userinfoMetadataSchema.parse(
        authorizationServerMetadata,
      ).userinfo_endpoint;
      if (!endpoint) return undefined;
      const response = await fetchFn(endpoint, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return undefined;
      return identityFromClaims(claimsSchema.parse(await response.json()));
    } catch {
      return undefined;
    }
  }
}
