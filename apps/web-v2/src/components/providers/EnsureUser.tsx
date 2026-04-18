"use client";

import { useState, useEffect, useCallback } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@vmem/backend";
import { Spinner } from "@vmem/ui";

export function EnsureUser({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const ensureUserExists = useMutation(api.auth.ensureUserExists);
  const [ready, setReady] = useState(false);

  const ensure = useCallback(async () => {
    await ensureUserExists({});
    setReady(true);
  }, [ensureUserExists]);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      ensure();
    }
  }, [isLoaded, isSignedIn, ensure]);

  if (!isLoaded || !isSignedIn || !ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
