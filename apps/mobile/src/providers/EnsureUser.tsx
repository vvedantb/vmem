import { useAuth } from "@clerk/clerk-expo";
import { api } from "@vmem/backend";
import { useMutation } from "convex/react";
import { useEffect } from "react";

/**
 * Same as web `EnsureUser` / extension `EnsureUser`: create the Convex `users`
 * row (and default Personal profile) once Clerk has a session. Memory Settings
 * queries need that row or they throw "Not authenticated".
 */
export function EnsureUser() {
  const { isLoaded, isSignedIn } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const ensureUserExists = useMutation(api.auth.ensureUserExists);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void ensureUserExists();
    }
  }, [isLoaded, isSignedIn, ensureUserExists]);

  return null;
}
