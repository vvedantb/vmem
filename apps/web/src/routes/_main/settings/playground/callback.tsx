import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_main/settings/playground/callback")({
  component: PlaygroundCallbackPage,
  validateSearch: (search: { code?: string; state?: string }) => ({
    code: typeof search.code === "string" ? search.code : "",
    state: typeof search.state === "string" ? search.state : "",
  }),
});

function postMessageToOpener(
  opener: object,
  message: { type: string; code: string; state: string },
  targetOrigin: string,
): void {
  // PropertyDescriptor.value is `any` in lib.es5 — read once as unknown.
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- PropertyDescriptor.value
  const postMessage: unknown =
    Object.getOwnPropertyDescriptor(opener, "postMessage")?.value ??
    Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(opener),
      "postMessage",
    )?.value;
  if (typeof postMessage !== "function") return;
  postMessage.call(opener, message, targetOrigin);
}

function PlaygroundCallbackPage() {
  const { code, state } = useSearch({
    from: "/_main/settings/playground/callback",
  });

  useEffect(() => {
    const opener: unknown = window.opener;
    if (!code || !state || typeof opener !== "object" || opener === null) {
      return;
    }
    postMessageToOpener(
      opener,
      { type: "mcp-oauth-callback", code, state },
      window.location.origin,
    );
  }, [code, state]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted">
        Connecting... you can close this window.
      </p>
    </div>
  );
}
