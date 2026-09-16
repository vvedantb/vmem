import { createFileRoute, redirect } from "@tanstack/react-router";
import { AGENT_LOGIN_PATH } from "@/lib/dev-agent-login";
import { landingSearchSchema } from "@/lib/url-state/landing";
import { LandingPage } from "./_components/landing/LandingPage";

export const Route = createFileRoute("/")({
  validateSearch: landingSearchSchema,
  beforeLoad: ({ context, search }) => {
    if (search.agent) {
      window.location.href = AGENT_LOGIN_PATH;
    }
    if (context.isSignedIn) {
      throw redirect({ to: "/home" });
    }
  },
  component: LandingPage,
});
