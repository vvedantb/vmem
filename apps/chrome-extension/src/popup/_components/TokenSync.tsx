"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/chrome-extension";
import { setAuthToken } from "@/lib/storage";

export function TokenSync() {
  const { getToken, isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setAuthToken("");
      return;
    }

    let active = true;

    async function sync() {
      // Get token with "convex" template so Convex can verify it
      const token = await getToken({ template: "convex" });
      if (active) {
        setAuthToken(token ?? "");
      }
    }

    sync();

    const interval = setInterval(sync, 50_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [getToken, isSignedIn, isLoaded]);

  return null;
}
