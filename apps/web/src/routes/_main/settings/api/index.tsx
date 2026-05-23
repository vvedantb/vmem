import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/settings/api` — redirects to the default tab (`/settings/api/usage`).
 * Each tab is a real subroute now; the bare `/settings/api` URL is
 * preserved as a redirect for existing bookmarks.
 */
export const Route = createFileRoute("/_main/settings/api/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/api/usage" });
  },
  component: () => null,
});
