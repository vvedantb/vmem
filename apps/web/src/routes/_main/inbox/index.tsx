import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/inbox` — redirects to the default tab (`/inbox/proposals`). Each tab
 * is a real subroute now; the bare `/inbox` URL is preserved as a
 * redirect for existing bookmarks.
 */
export const Route = createFileRoute("/_main/inbox/")({
  beforeLoad: () => {
    throw redirect({ to: "/inbox/proposals" });
  },
  component: () => null,
});
