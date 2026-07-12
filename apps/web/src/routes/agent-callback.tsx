import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useSignIn } from "@clerk/clerk-react";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/agent-callback")({
  component: AgentCallback,
  validateSearch: (search: { ticket?: string }) => ({
    ticket: typeof search.ticket === "string" ? search.ticket : "",
  }),
});

function AgentCallback() {
  const { signIn, setActive } = useSignIn();
  const { ticket } = useSearch({ from: "/agent-callback" });
  const navigate = useNavigate();
  const consumed = useRef(false);

  useEffect(() => {
    if (!ticket || !signIn || consumed.current) return;
    consumed.current = true;

    signIn
      .create({ strategy: "ticket", ticket })
      .then((result) => {
        if (result.createdSessionId) {
          return setActive({ session: result.createdSessionId }).then(() => {
            void navigate({ to: "/home", replace: true });
          });
        }
      })
      .catch((err: unknown) => {
        console.error(
          "Agent sign-in failed:",
          err instanceof Error ? err.message : err,
        );
      });
  }, [signIn, setActive, ticket, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted">Signing in...</p>
    </div>
  );
}
