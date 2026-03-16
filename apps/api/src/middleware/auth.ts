import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import jwt from "jsonwebtoken";
import { z } from "zod/v4";

const mcpJwtPayloadSchema = z.object({ sub: z.string() });

interface AuthEnv {
  Variables: {
    userId: string;
  };
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  const clerkUserId = await verifyWithClerk(token);
  if (clerkUserId) {
    c.set("userId", clerkUserId);
    await next();
    return;
  }

  const mcpUserId = verifyWithMcpJwt(token);
  if (mcpUserId) {
    c.set("userId", mcpUserId);
    await next();
    return;
  }

  return c.json({ error: "Invalid or expired token" }, 401);
});

async function verifyWithClerk(token: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  try {
    const payload = await verifyToken(token, { secretKey });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function verifyWithMcpJwt(token: string): string | null {
  const secret = process.env.MCP_JWT_SECRET;
  if (!secret) return null;

  try {
    const decoded = jwt.verify(token, secret);
    const parsed = mcpJwtPayloadSchema.safeParse(decoded);
    if (!parsed.success) return null;
    return parsed.data.sub;
  } catch {
    return null;
  }
}
