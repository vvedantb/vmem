import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";

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
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    return c.json({ error: "Server auth not configured" }, 500);
  }

  try {
    const payload = await verifyToken(token, { secretKey });
    const clerkUserId = payload.sub;

    if (!clerkUserId) {
      return c.json({ error: "Invalid token: no subject" }, 401);
    }

    c.set("userId", clerkUserId);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
