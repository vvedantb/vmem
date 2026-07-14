// extracts the bearer token from an Authorization header value
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const [scheme, token, ...rest] = authHeader.split(" ");
  if (rest.length > 0 || !scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
}
