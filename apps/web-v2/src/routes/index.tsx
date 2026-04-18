import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { SignInButton, SignUpButton, useSignIn } from "@clerk/clerk-react";
import { Button } from "@vmem/ui";
import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { env, PROD } from "@/env";

export const Route = createFileRoute("/")({
  component: LandingPage,
  validateSearch: (search: Record<string, unknown>) => ({
    agent: search.agent === "" || search.agent === "true" ? true : undefined,
  }),
});

function LandingPage() {
  const { agent } = useSearch({ from: "/" });
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigate = useNavigate();
  const triggered = useRef(false);

  // Agent auto-login: redirect to Convex HTTP action for agent sign-in
  useEffect(() => {
    if (agent && isLoaded && !triggered.current) {
      triggered.current = true;
      // Redirect to Convex HTTP action for agent login
      const convexUrl = env.VITE_CONVEX_URL.replace(".cloud", ".site");
      window.location.href = `${convexUrl}/api/auth/agent-login`;
    }
  }, [agent, isLoaded]);

  const isProduction = PROD;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          <img
            src="/icon.png"
            alt="vmem"
            width={80}
            height={80}
            className="rounded-2xl"
          />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
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
          <Link to="/" search={{ agent: true }}>
            <Button size="lg" variant="ghost">
              Sign in anonymously
            </Button>
          </Link>
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
