// active workspace context for /$profileId/* (provider + useActiveProfile*)

import { createContext, use, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useLocalStorage } from "usehooks-ts";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";

const ActiveProfileIdContext = createContext<Id<"profiles"> | null>(null);

export function ActiveProfileProvider({
  profileId,
  children,
}: {
  profileId: Id<"profiles">;
  children: ReactNode;
}) {
  return (
    <ActiveProfileIdContext.Provider value={profileId}>
      {children}
    </ActiveProfileIdContext.Provider>
  );
}

export function useActiveProfile(): Doc<"profiles"> {
  const profileId = use(ActiveProfileIdContext);
  if (profileId === null) {
    throw new Error(
      "useActiveProfile must be used inside the $profileId workspace route",
    );
  }
  const profiles = useQuery(api.profiles.list);
  if (profiles === undefined) {
    throw new Error("Active profile is loading");
  }
  const profile = profiles.find((p) => p._id === profileId);
  if (profile === undefined) {
    throw new Error("Active profile not found");
  }
  return profile;
}

const LAST_PROFILE_STORAGE_KEY = "vmem:last-profile-id";

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
// Prefer ActiveProfileProvider when inside /$profileId; fall back to URL /
// last-visited id for shell/sidebar outside that provider.
export function useActiveTeamId(): Id<"teams"> | undefined {
  const profileIdFromContext = use(ActiveProfileIdContext);
  const profileIdFromRoute = useActiveProfileId();
  const resolvedProfileId = profileIdFromContext ?? profileIdFromRoute;
  const profiles = useQuery(
    api.profiles.list,
    resolvedProfileId === undefined ? "skip" : {},
  );
  if (resolvedProfileId === undefined) return undefined;
  return profiles?.find((p) => p._id === resolvedProfileId)?.teamId;
}
