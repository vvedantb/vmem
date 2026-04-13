import jwt from "jsonwebtoken";

interface McpTokenPayload {
  sub: string;
  clerkUserId: string;
}

/**
 * Verify an MCP JWT token and extract the Clerk user ID.
 * Returns null if the token is invalid.
 */
export function verifyMcpJwt(token: string): string | null {
  const secret = process.env.MCP_JWT_SECRET;
  if (!secret) {
    console.error("[mcpAuth] MCP_JWT_SECRET not set");
    return null;
  }

  try {
    const decoded = jwt.verify(token, secret) as McpTokenPayload;
    return decoded.clerkUserId ?? decoded.sub ?? null;
  } catch {
    return null;
  }
}
