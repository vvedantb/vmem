import { createFileRoute } from "@tanstack/react-router";

// A system skill's read-only detail page. Rendered by the skills layout
// (route.tsx) when this route is active — same stub pattern as `$id` and
// `hub`; the layout owns rendering so the sidebar/state stay shared.
export const Route = createFileRoute(
  "/_main/$profileId/skills/system/$skillId",
)({
  component: () => null,
});
