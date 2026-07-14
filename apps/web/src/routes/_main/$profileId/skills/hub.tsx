import { createFileRoute } from "@tanstack/react-router";

// the Skills Hub renders from the parent skills layout (route.tsx) when this route is
export const Route = createFileRoute("/_main/$profileId/skills/hub")({
  component: () => null,
});
