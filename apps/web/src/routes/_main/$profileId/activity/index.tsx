import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/activity` — redirects to the default tab (`/activity/ai-logs`). Each
 * tab is now a real subroute so navigation is plain `<Link>` and active
 * state is derived from the URL. The bare `/activity` URL is preserved as
 * a redirect so existing bookmarks keep working.
 */
export const Route = createFileRoute("/_main/$profileId/activity/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/activity/ai-logs", params });
  },
  component: () => null,
});
