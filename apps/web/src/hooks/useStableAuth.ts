import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

// tracks sign in during this session to detect stale deploy auth loss
let wasEverSignedIn = false;

// debounce brief auth flicker after deploy so convex does not cascade
// AI-generated (Claude), prompt: "debounce clerk auth loss after stale post deploy javascript"
// Modified by me: two second override loading so convex does not cascade
export function useStableAuth() {
  const auth = useAuth();
  const [overrideLoading, setOverrideLoading] = useState(false);

  useEffect(() => {
    if (auth.isSignedIn) {
      wasEverSignedIn = true;
      setOverrideLoading(false);
      return;
    }

    // debounce auth loss after deploy to avoid convex auth cascade
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
