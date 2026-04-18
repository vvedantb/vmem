// Vite exposes env vars via import.meta.env
// All public env vars must be prefixed with VITE_

export const env = {
  VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
  VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  VITE_MCP_URL: import.meta.env.VITE_MCP_URL,
  DEV: import.meta.env.DEV,
  PROD: import.meta.env.PROD,
} as const;

// Runtime validation
function validateEnv() {
  if (!env.VITE_CONVEX_URL) {
    throw new Error("Missing VITE_CONVEX_URL environment variable");
  }
  if (!env.VITE_CLERK_PUBLISHABLE_KEY) {
    throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable");
  }
}

validateEnv();
