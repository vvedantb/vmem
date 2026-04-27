import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/memories` lands on the graph view by default. Each tab is its own
 * subroute now (`/memories/graph`, `/memories/list`, `/memories/tags`)
 * — see `-components/MemoriesTabs.tsx` for the shared tab bar.
 */
export const Route = createFileRoute("/_main/memories/")({
  beforeLoad: () => {
    throw redirect({ to: "/memories/graph" });
  },
});
