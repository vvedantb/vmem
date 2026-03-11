import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const jwksUrl =
      process.env.CLERK_JWKS_URL ??
      `${process.env.CLERK_ISSUER ?? ""}/.well-known/jwks.json`;
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwks;
}

/**
 * Middleware that verifies the Clerk JWT from the Authorization header and
 * stores the authenticated userId in the Hono context variable.
 * Routes should read userId from c.get("userId") instead of query params.
 */
export async function clerkAuth(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization header required" }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJWKS());
    const userId = payload.sub;
    if (!userId) {
      return c.json({ error: "Invalid token: missing subject" }, 401);
    }
    c.set("userId", userId);
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  await next();
}
