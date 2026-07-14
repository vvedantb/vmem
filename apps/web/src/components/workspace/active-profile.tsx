/**
 * Active workspace (profile) plumbing for the `/$profileId/*` route tree.
 *
 * - `ActiveProfileProvider` is mounted by `routes/_main/$profileId/route.tsx`
 *   once the profile in the URL is validated against `api.profiles.list`.
 * - `useActiveProfile()` — for components rendered INSIDE the workspace
 *   outlet; returns the full profile doc and throws if used elsewhere.
 * - `useActiveProfileId()` — for shell components rendered ABOVE the outlet
 *   (sidebar, command palette). Reads the route param when present and
 *   falls back to the last-remembered workspace on user-level routes
 *   like `/settings/**` so the shell keeps its workspace context.
 */

import { createContext, use, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";

const ActiveProfileContext = createContext<Doc<"profiles"> | null>(null);

export function ActiveProfileProvider({
  profile,
  children,
}: {
  profile: Doc<"profiles">;
  children: ReactNode;
}) {
  return (
    <ActiveProfileContext.Provider value={profile}>
      {children}
    </ActiveProfileContext.Provider>
  );
}

export function useActiveProfile(): Doc<"profiles"> {
  const profile = use(ActiveProfileContext);
  if (profile === null) {
    throw new Error(
      "useActiveProfile must be used inside the $profileId workspace route",
    );
  }
  return profile;
}

const LAST_PROFILE_STORAGE_KEY = "vmem:last-profile-id";

export function rememberActiveProfileId(profileId: string): void {
  try {
    window.localStorage.setItem(LAST_PROFILE_STORAGE_KEY, profileId);
  } catch {
    // private mode / storage disabled — losing the remembered workspace is fine
  }
}

export function readLastActiveProfileId(): string | null {
  try {
    return window.localStorage.getItem(LAST_PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Active workspace id for components rendered OUTSIDE the `$profileId`
 * outlet. `undefined` only when no workspace has ever been visited
 * (fresh browser, user-level route) — callers should render a disabled /
 * fallback state in that case.
 */
export function useActiveProfileId(): string | undefined {
  const params = useParams({ strict: false });
  const profileId: string | undefined = params.profileId;
  if (typeof profileId === "string") return profileId;
  return readLastActiveProfileId() ?? undefined;
}

/**
 * The active workspace's team id (undefined = personal workspace). For
 * shell components rendered OUTSIDE the `$profileId` outlet that need to
 * scope content queries (skills/wiki/files). Inside the outlet prefer
 * `useActiveProfile().teamId`.
 */
export function useActiveTeamId(): Id<"teams"> | undefined {
  const profileId = useActiveProfileId();
  const profiles = useQuery(api.profiles.list);
  if (profileId === undefined) return undefined;
  return profiles?.find((p) => p._id === profileId)?.teamId;
}
