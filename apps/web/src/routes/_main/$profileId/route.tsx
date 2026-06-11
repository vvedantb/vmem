import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { IconLoader2 } from "@tabler/icons-react";
import {
  ActiveProfileProvider,
  rememberActiveProfileId,
} from "@/components/workspace/active-profile";
import { isLegacyFirstSegment } from "@/components/workspace/workspace-paths";
import {
  LegacyPathRedirect,
  NotFoundPage,
} from "@/components/workspace/LegacyPathRedirect";

/**
 * Workspace layout: validates the `$profileId` URL segment against the
 * profiles visible to the signed-in user (string-safe — `profiles.list`
 * never throws on garbage, unlike `profiles.get` whose arg is `v.id`)
 * and provides the active profile to everything below.
 *
 * No-match handling is load-bearing: single-segment legacy URLs like
 * `/chat` match this route with `profileId === "chat"`, so unknown ids
 * that are known legacy segments fall through to LegacyPathRedirect
 * instead of a 404.
 */
export const Route = createFileRoute("/_main/$profileId")({
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { profileId } = Route.useParams();
  const profiles = useQuery(api.profiles.list);
  const profile = profiles?.find((p) => p._id === profileId);

  useEffect(() => {
    if (profile !== undefined) rememberActiveProfileId(profile._id);
  }, [profile]);

  if (profiles === undefined) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <IconLoader2 size={20} className="animate-spin text-muted" />
      </div>
    );
  }

  if (profile === undefined) {
    if (isLegacyFirstSegment(profileId)) return <LegacyPathRedirect />;
    return (
      <NotFoundPage message="Workspace not found, or you don't have access to it." />
    );
  }

  return (
    <ActiveProfileProvider profile={profile}>
      <Outlet />
    </ActiveProfileProvider>
  );
}
