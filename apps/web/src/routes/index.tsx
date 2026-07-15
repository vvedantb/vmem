import { createFileRoute, redirect } from "@tanstack/react-router";
import { LandingPage } from "./_components/landing/LandingPage";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.isSignedIn) {
      throw redirect({ to: "/home" });
    }
  },
  component: LandingPage,
});
