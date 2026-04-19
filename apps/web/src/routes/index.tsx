import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { Button } from "@vmem/ui";
import { env } from "@/env";

const isProduction = env.VITE_ENV === "production";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.isSignedIn) {
      throw redirect({ to: "/home" });
    }
  },
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const hasAgent = new URLSearchParams(window.location.search).has("agent");

  if (hasAgent) {
    window.location.href = "/api/auth/agent-login";
    return <div className="min-h-screen w-full bg-background" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          <img
            src="/icon.png"
            alt="vmem"
            width={80}
            height={80}
            className="rounded-2xl outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          />
          <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">
            vmem
          </h1>
          <p className="text-center text-sm text-muted-foreground">
            Memory engine for AI agents
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {isProduction ? (
            <>
              <Button size="lg" variant="default" disabled>
                Sign In
              </Button>
              <Button size="lg" variant="outline" disabled>
                Sign Up
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {!isProduction && (
          <div className="flex justify-center">
            <Button
              size="lg"
              variant="ghost"
              onClick={() => {
                navigate({ to: "/", search: { agent: true } });
              }}
            >
              Sign in anonymously
            </Button>
          </div>
        )}

        {isProduction && (
          <div className="max-w-sm rounded-lg bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
            vmem is fully open source and self-hosted. Clone the repo, create
            your own Convex and Clerk projects, and run it locally.
          </div>
        )}
      </div>
    </div>
  );
}
