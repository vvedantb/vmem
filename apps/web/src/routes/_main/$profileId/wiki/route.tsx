import { createFileRoute, redirect } from "@tanstack/react-router";

// the vmem wiki is gone: `/wiki` and every `/wiki/...` path land on workspace home
export const Route = createFileRoute("/_main/$profileId/wiki")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$profileId/home",
      params: { profileId: params.profileId },
    });
  },
});
