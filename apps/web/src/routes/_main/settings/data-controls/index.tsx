import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/settings/data-controls` — redirects to the default tab
 * (`/settings/data-controls/import`). Each tab is a real subroute; the
 * bare path is preserved as a redirect so sidebar links and bookmarks
 * always land on a real tab.
 */
export const Route = createFileRoute("/_main/settings/data-controls/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/data-controls/import" });
  },
  component: () => null,
});
