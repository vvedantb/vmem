import { createFileRoute } from "@tanstack/react-router";

// A system skill's read-only detail page
export const Route = createFileRoute(
  "/_main/$profileId/skills/system/$skillId",
)({
  component: () => null,
});
