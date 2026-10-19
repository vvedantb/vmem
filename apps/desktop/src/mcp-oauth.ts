import {
  auth,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  createMcpOAuthProvider as createSharedMcpOAuthProvider,
  createMcpOAuthStateSchema,
  type McpOAuthIdentity,
  type McpOAuthProvider,
  type McpOAuthProviderOptions as SharedMcpOAuthProviderOptions,
} from "@vvedantb/server";
import { z } from "zod";

// vmem sign-in: MCP authorization (OAuth 2.1, PKCE, dynamic client registration)
// against the vmem MCP server, which accepts Clerk OAuth tokens. The provider,
// refresh and revoke come from @vvedantb/server; this module fixes the vmem
// client identity. No Electron imports: main supplies the storage, the redirect and the browser.

export const CLIENT_NAME = "vmem";
const SCOPE = "openid profile email";
const SIGN_IN_REQUIRED_MESSAGE = "Sign in from the vmem settings window";

/** What is kept for the vmem server. Tokens and client carry the `issuer` they belong to. */
export const mcpOAuthStateSchema = createMcpOAuthStateSchema(z);
export type Identity = McpOAuthIdentity;

export type McpOAuthProviderOptions = Pick<
  SharedMcpOAuthProviderOptions,
  "storage" | "redirectUrl" | "redirectToAuthorization" | "now"
>;

/**
 * An OAuthClientProvider over injected storage. Interactive (redirectUrl set): may register a client and open the browser.
 * Not interactive: only uses what is stored (and refreshes it), so a 401 fails fast and never opens a browser or registers a client.
 */
export function createMcpOAuthProvider(
  options: McpOAuthProviderOptions,
): McpOAuthProvider {
  const provider = createSharedMcpOAuthProvider({
    ...options,
    clientName: CLIENT_NAME,
    scope: SCOPE,
    signInRequiredMessage: SIGN_IN_REQUIRED_MESSAGE,
  });
  const save = provider.saveClientInformation?.bind(provider);
  // Parse the registered client first, as vmem always has: the stored JSON keeps its key order (client_id first).
  if (save) {
    provider.saveClientInformation = (info) => {
      const { clientInformation } = mcpOAuthStateSchema.parse({
        clientInformation: info,
      });
      return clientInformation ? save(clientInformation) : undefined;
    };
  }
  // Throw synchronously when not interactive, as vmem always has; the package version returns a rejected promise.
  if (!options.redirectUrl || !options.redirectToAuthorization) {
    provider.redirectToAuthorization = () => {
      throw new UnauthorizedError(SIGN_IN_REQUIRED_MESSAGE);
    };
  }
  return provider;
}

/**
 * Signs in. The SDK finds the protected resource metadata (RFC 9728) and the authorization server, registers a client and
 * calls redirectToAuthorization. Then `code` is awaited and exchanged. Resolves once tokens are saved.
 * Kept local: the package version also has a `connectAs` path, which bundles the SDK's MCP client and ajv into main.js.
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

export {
  hasMcpOAuthTokens,
  isAccessTokenExpiring,
  refreshMcpOAuth,
  revokeMcpOAuth,
  type McpOAuthProvider,
  type McpOAuthState,
  type McpOAuthStorage,
} from "@vvedantb/server";
