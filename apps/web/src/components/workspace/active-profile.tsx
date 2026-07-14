// active workspace context for /$profileId/* (provider + useActiveProfile*)

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

// workspace id outside $profileId outlet; undefined if never visited
export function useActiveProfileId(): string | undefined {
  const params = useParams({ strict: false });
  const profileId: string | undefined = params.profileId;
  if (typeof profileId === "string") return profileId;
  return readLastActiveProfileId() ?? undefined;
}

// team id for shell outside $profileId (undefined = personal)
export function useActiveTeamId(): Id<"teams"> | undefined {
  const profileId = useActiveProfileId();
  const profiles = useQuery(api.profiles.list);
  if (profileId === undefined) return undefined;
  return profiles?.find((p) => p._id === profileId)?.teamId;
}
