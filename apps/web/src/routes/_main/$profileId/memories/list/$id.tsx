import { createFileRoute } from "@tanstack/react-router";

/** URL shell for `/memories/list/$id` — list UI is rendered by `list/route.tsx`. */
export const Route = createFileRoute("/_main/$profileId/memories/list/$id")({
  component: () => null,
});
