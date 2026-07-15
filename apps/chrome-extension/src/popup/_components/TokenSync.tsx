"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/chrome-extension";
import { useInterval } from "usehooks-ts";
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

    void getToken({ template: "convex" }).then((token) => {
      if (active) {
        void setAuthToken(token ?? "");
      }
    });

    return () => {
      active = false;
    };
  }, [getToken, isSignedIn, isLoaded]);

  useInterval(
    () => {
      void getToken({ template: "convex" }).then((token) => {
        void setAuthToken(token ?? "");
      });
    },
    isLoaded && isSignedIn ? 50_000 : null,
  );

  return null;
}
