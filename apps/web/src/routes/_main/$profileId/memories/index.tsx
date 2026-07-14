import { createFileRoute, redirect } from "@tanstack/react-router";

// `/memories` lands on the graph view by default
export const Route = createFileRoute("/_main/$profileId/memories/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/memories/graph", params });
  },
});
