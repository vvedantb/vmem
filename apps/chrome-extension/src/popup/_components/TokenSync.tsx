"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/chrome-extension";
import { setAuthToken } from "@/lib/storage";

export function TokenSync() {
  const { getToken, isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      void setAuthToken("");
      return;
    }

    let active = true;

    async function sync() {
      // get token with "convex" template so convex can verify it
      const token = await getToken({ template: "convex" });
      if (active) {
        await setAuthToken(token ?? "");
      }
    }

    void sync();

    const interval = setInterval(sync, 50_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [getToken, isSignedIn, isLoaded]);

  return null;
}
