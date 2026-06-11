import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy redirect: the dedicated Tags route folded into the list route as
 * `?view=tags`. Old `/memories/tags` URLs keep working — we hop straight
 * over to `/memories/list?view=tags` so any saved bookmarks land on the
 * same content.
 */
export const Route = createFileRoute("/_main/$profileId/memories/tags")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$profileId/memories/list",
      params,
      search: { view: "tags" },
    });
  },
});
