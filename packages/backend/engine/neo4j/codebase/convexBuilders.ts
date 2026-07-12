/**
 * Convex function-builder names (`query`, `mutation`, …) shared by the
 * parser (is this a Convex export?) and entry-point detection (what kind?).
 */

import type { EntryPoint } from "./types";

export const CONVEX_BUILDER_KIND_BY_NAME: Record<string, EntryPoint["kind"]> = {
  query: "convex_query",
  mutation: "convex_mutation",
  action: "convex_action",
  internalQuery: "convex_internal",
  internalMutation: "convex_internal",
  internalAction: "convex_internal",
  authInternalAction: "convex_internal",
  httpAction: "convex_http",
  authQuery: "convex_query",
  authMutation: "convex_mutation",
  authAction: "convex_action",
};

export function isConvexBuilderName(name: string): boolean {
  return Object.hasOwn(CONVEX_BUILDER_KIND_BY_NAME, name);
}

export function convexEntryKind(name: string): EntryPoint["kind"] | undefined {
  return CONVEX_BUILDER_KIND_BY_NAME[name];
}
