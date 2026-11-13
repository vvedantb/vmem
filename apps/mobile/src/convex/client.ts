import { ConvexReactClient } from "convex/react";
import { CONVEX_URL } from "@/config";

/** One client for the app. `AuthProviders` adds Clerk auth to it. */
export const convex = new ConvexReactClient(CONVEX_URL);
