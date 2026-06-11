import { createFileRoute, redirect } from "@tanstack/react-router";

/** Bare `/$profileId/team` → members (the default team tab). */
export const Route = createFileRoute("/_main/$profileId/team/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$profileId/team/members", params });
  },
  component: () => null,
});
