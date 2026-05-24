import { createFileRoute, redirect } from "@tanstack/react-router";

const teamTabs = ["overview", "knowledge", "members", "settings"] as const;

type LegacyTeamTab = (typeof teamTabs)[number];

function isLegacyTeamTab(value: string): value is LegacyTeamTab {
  for (const tab of teamTabs) {
    if (tab === value) {
      return true;
    }
  }
  return false;
}

/**
 * `/teams/:id` redirects to the overview subroute. Preserves legacy `?tab=`
 * bookmarks by mapping them to the matching path.
 */
export const Route = createFileRoute("/_main/teams/$teamId/")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    tags: typeof search.tags === "string" ? search.tags : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    const tab =
      search.tab && isLegacyTeamTab(search.tab) ? search.tab : "overview";

    if (tab === "knowledge") {
      throw redirect({
        to: "/teams/$teamId/knowledge",
        params: { teamId: params.teamId },
        search:
          search.q !== undefined || search.tags !== undefined
            ? { q: search.q, tags: search.tags }
            : {},
      });
    }

    if (tab === "members") {
      throw redirect({
        to: "/teams/$teamId/members",
        params: { teamId: params.teamId },
      });
    }

    if (tab === "settings") {
      throw redirect({
        to: "/teams/$teamId/settings",
        params: { teamId: params.teamId },
      });
    }

    throw redirect({
      to: "/teams/$teamId/overview",
      params: { teamId: params.teamId },
    });
  },
  component: () => null,
});
