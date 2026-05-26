import { createFileRoute, redirect } from "@tanstack/react-router";
import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { Button } from "@vmem/ui";
import { z } from "zod";

const searchSchema = z.object({
  agent: z.boolean().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  beforeLoad: ({ context, search }) => {
    if (search.agent) {
      window.location.href = "/api/auth/agent-login";
    }
    if (context.isSignedIn) {
      throw redirect({ to: "/home" });
    }
  },
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          <img
            src="/icon.png"
            alt="vmem"
            width={80}
            height={80}
            className="rounded-lg outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          />
          <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">
            vmem
          </h1>
          <p className="text-center text-sm text-muted">
            Memory engine for AI agents
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <SignInButton mode="modal">
            <Button size="lg" variant="default">
              Sign In
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="lg" variant="outline">
              Sign Up
            </Button>
          </SignUpButton>
        </div>

        <div className="flex justify-center">
          <Button
            size="lg"
            variant="ghost"
            onClick={() => {
              window.location.href = "/api/auth/agent-login";
            }}
          >
            Sign in anonymously
          </Button>
        </div>
      </div>
    </div>
  );
}
