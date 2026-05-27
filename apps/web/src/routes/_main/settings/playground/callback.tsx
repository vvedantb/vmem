import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_main/settings/playground/callback")({
  component: PlaygroundCallbackPage,
  validateSearch: (search: Record<string, unknown>) => ({
    code: (search.code as string) ?? "",
    state: (search.state as string) ?? "",
  }),
});

function PlaygroundCallbackPage() {
  const { code, state } = useSearch({
    from: "/_main/settings/playground/callback",
  });

  useEffect(() => {
    if (code && state && window.opener) {
      window.opener.postMessage(
        { type: "mcp-oauth-callback", code, state },
        window.location.origin,
      );
    }
  }, [code, state]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted">
        Connecting... you can close this window.
      </p>
    </div>
  );
}
