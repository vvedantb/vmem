import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

// tracks whether the user has been signed in during this page session
// used by useStableAuth to detect unexpected auth loss (stale deployment)
let wasEverSignedIn = false;

// debounce clerk auth loss after stale post-deploy js (avoids convex auth cascade)
export function useStableAuth() {
  const auth = useAuth();
  const [overrideLoading, setOverrideLoading] = useState(false);

  useEffect(() => {
    if (auth.isSignedIn) {
      wasEverSignedIn = true;
      setOverrideLoading(false);
      return;
    }

    // was signed in and now not — debounce to avoid Convex auth cascade
    if (wasEverSignedIn && auth.isLoaded && !auth.isSignedIn) {
      setOverrideLoading(true);
      const timer = setTimeout(() => {
        wasEverSignedIn = false;
        setOverrideLoading(false);
      }, 2000);
      return () => clearTimeout(timer);
    }

    setOverrideLoading(false);
  }, [auth.isLoaded, auth.isSignedIn]);

  if (overrideLoading) {
    return { ...auth, isLoaded: false };
  }
  return auth;
}
