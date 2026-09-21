import { createFileRoute, redirect } from "@tanstack/react-router";

// `/sources` lands on connectors
export const Route = createFileRoute("/_main/$profileId/sources/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/sources/connectors", params });
  },
  component: () => null,
});
