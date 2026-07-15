// active workspace context for /$profileId/* (provider + useActiveProfile*)

import { createContext, use, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useLocalStorage } from "usehooks-ts";
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

export const LAST_PROFILE_STORAGE_KEY = "vmem:last-profile-id";

// plain string (not JSON) so existing raw profile ids keep working
const lastProfileStorageOptions = {
  serializer: (value: string | null) => value ?? "",
  deserializer: (value: string) => (value.length === 0 ? null : value),
};

export function useLastActiveProfileId() {
  return useLocalStorage<string | null>(
    LAST_PROFILE_STORAGE_KEY,
    null,
    lastProfileStorageOptions,
  );
}

// workspace id outside $profileId outlet; undefined if never visited
export function useActiveProfileId(): string | undefined {
  const params = useParams({ strict: false });
  const [lastProfileId] = useLastActiveProfileId();
  const profileId: string | undefined = params.profileId;
  if (typeof profileId === "string") return profileId;
  return lastProfileId ?? undefined;
}

// team id for the active workspace (undefined = personal).
// Prefer ActiveProfileProvider when inside /$profileId; fall back to a
// profiles.list lookup for shell/sidebar outside that provider.
export function useActiveTeamId(): Id<"teams"> | undefined {
  const fromContext = use(ActiveProfileContext);
  const profileId = useActiveProfileId();
  const profiles = useQuery(
    api.profiles.list,
    fromContext === null ? {} : "skip",
  );
  if (fromContext !== null) return fromContext.teamId;
  if (profileId === undefined) return undefined;
  return profiles?.find((p) => p._id === profileId)?.teamId;
}
