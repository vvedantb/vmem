import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CONVEX_URL: z.string().url(),
    VITE_CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
    VITE_MCP_URL: z.string().url().optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});

// Re-export Vite's built-in env vars for convenience
export const DEV = import.meta.env.DEV;
export const PROD = import.meta.env.PROD;
