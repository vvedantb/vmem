import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$profileId/skills/$id")({
  component: () => null,
});
