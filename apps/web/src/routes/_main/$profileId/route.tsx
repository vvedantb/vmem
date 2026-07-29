import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api, type Doc } from "@vmem/backend";
import { IconLoader2 } from "@tabler/icons-react";
import {
  ActiveProfileProvider,
  useLastActiveProfileId,
} from "@/components/workspace/active-profile";
import { isLegacyFirstSegment } from "@/components/workspace/workspace-paths";
import {
  LegacyPathRedirect,
  NotFoundPage,
} from "@/components/workspace/LegacyPathRedirect";

// workspace layout validates the `$profileId` URL segment against the profiles
export const Route = createFileRoute("/_main/$profileId")({
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { profileId } = Route.useParams();
  const profiles = useQuery(api.profiles.list);
  const [, setLastProfileId] = useLastActiveProfileId();
  const profile: Doc<"profiles"> | undefined = profiles?.find(
    (p) => p._id === profileId,
  );

  useEffect(() => {
    if (profile !== undefined) setLastProfileId(profile._id);
  }, [profile, setLastProfileId]);

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
    <ActiveProfileProvider profileId={profile._id}>
      <Outlet />
    </ActiveProfileProvider>
  );
}
