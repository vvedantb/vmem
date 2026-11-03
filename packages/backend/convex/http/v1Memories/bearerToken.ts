export const API_KEY_PREFIX = "vmem_sk_";

type BearerResolvers<A> = {
  apiKey: (token: string) => Promise<A | null>;
  clerk: (token: string) => Promise<A | null>;
};

// `vmem_sk_` tokens are API keys. Any other bearer is a Clerk OAuth access
// token or a Clerk session JWT (MCP_ACCEPTED_TOKEN_TYPES).
export function resolveBearerAuth<A>(
  token: string,
  resolvers: BearerResolvers<A>,
): Promise<A | null> {
  return token.startsWith(API_KEY_PREFIX)
    ? resolvers.apiKey(token)
    : resolvers.clerk(token);
}
