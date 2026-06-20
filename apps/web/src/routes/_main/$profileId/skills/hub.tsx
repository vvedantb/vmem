import { createFileRoute } from "@tanstack/react-router";

// The Skills Hub renders from the parent skills layout (route.tsx) when this
// route is active — same pattern as `$id` (the layout owns rendering). This
// file just anchors the `/skills/hub` URL.
export const Route = createFileRoute("/_main/$profileId/skills/hub")({
  component: () => null,
});
