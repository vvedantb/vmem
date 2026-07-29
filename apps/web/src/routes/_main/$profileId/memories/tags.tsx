import { createFileRoute, redirect } from "@tanstack/react-router";

// legacy redirect the dedicated Tags route folded into the list route as `?view=tags`
export const Route = createFileRoute("/_main/$profileId/memories/tags")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$profileId/memories/list",
      params,
      search: { view: "tags" },
    });
  },
});
