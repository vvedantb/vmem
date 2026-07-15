import { ConvexReactClient } from "convex/react";
import { env } from "@/env";

if (!env.VITE_CONVEX_URL) {
  throw new Error("Missing VITE_CONVEX_URL in your .env file");
}

export const convex = new ConvexReactClient(env.VITE_CONVEX_URL);
