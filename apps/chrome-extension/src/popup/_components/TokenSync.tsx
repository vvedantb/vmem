"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/chrome-extension";
import { setStorage } from "@/lib/storage";

export function TokenSync() {
  const { getToken, isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setStorage({ authToken: "" });
      return;
    }

    let active = true;

    async function sync() {
      const token = await getToken();
      if (active) {
        setStorage({ authToken: token ?? "" });
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
