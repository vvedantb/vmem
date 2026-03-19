"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function PlaygroundCallbackPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (code && state && window.opener) {
      window.opener.postMessage(
        { type: "mcp-oauth-callback", code, state },
        window.location.origin,
      );
    }
  }, [searchParams]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground text-sm">
        Connecting... you can close this window.
      </p>
    </div>
  );
}
