// catch-all for pre-workspace URLs (old bookmarks, stale docs)

import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { IconLoader2 } from "@tabler/icons-react";
import { Button } from "@vmem/ui";
import { isLegacyFirstSegment } from "./workspace-paths";
import { WorkspaceEntryRedirect } from "./WorkspaceEntryRedirect";

function CenteredSpinner() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <IconLoader2 size={20} className="animate-spin text-muted" />
    </div>
  );
}

export function NotFoundPage({
  message = "This page doesn't exist.",
}: {
  message?: string;
}) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-muted">{message}</p>
      <Link to="/home">
        <Button variant="outline" size="sm">
          Go to your workspace
        </Button>
      </Link>
    </div>
  );
}

// maps old `/teams/$teamId/<section>` pages onto the team workspace
function LegacyTeamRedirect({
  teamId,
  section,
  search,
}: {
  teamId: string;
  section: string | undefined;
  search: string;
}) {
  const navigate = useNavigate();
  const data = useQuery(api.teams.get, { teamId });

  useEffect(() => {
    if (data === undefined) return;
    const profileId = data?.profile?._id;
    if (profileId === undefined) return;
    const subPath =
      section === "members"
        ? "/team/members"
        : section === "settings"
          ? "/team/settings"
          : section === "knowledge"
            ? "/memories"
            : "/home";
    void navigate({ to: `/${profileId}${subPath}${search}`, replace: true });
  }, [data, section, search, navigate]);

  if (data === undefined) return <CenteredSpinner />;
  if (data === null || data.profile === null) return <NotFoundPage />;
  return <CenteredSpinner />;
}

export function LegacyPathRedirect() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();

  const { pathname, search } = window.location;
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  const isLegacy = first !== undefined && isLegacyFirstSegment(first);

  // signed-out visitors on a legacy (or unknown) path go to the landing page
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate({ to: "/", replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !isAuthenticated) return <CenteredSpinner />;
  if (!isLegacy) return <NotFoundPage />;

  if (first === "teams") {
    const teamId = segments[1];
    if (teamId === undefined) {
      return <WorkspaceEntryRedirect subPath="/home" search={search} />;
    }
    return (
      <LegacyTeamRedirect
        teamId={teamId}
        section={segments[2]}
        search={search}
      />
    );
  }

  return <WorkspaceEntryRedirect subPath={pathname} search={search} />;
}
