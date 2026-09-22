import { useEffect } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { slidesPublicBoot } from "@/lib/slides-public-boot";

/**
 * `/slides` boots with anonymous `ConvexProvider` (no Clerk /
 * `ConvexProviderWithAuth`). `useConvexAuth` throws without that provider, so
 * this wrapper must return before any auth hook runs.
 */
export function EnsureUser() {
  if (slidesPublicBoot) {
    return null;
  }
  return <EnsureUserWhenAuth />;
}

function EnsureUserWhenAuth() {
  const { isAuthenticated } = useConvexAuth();
  const ensureUserExists = useMutation(api.auth.ensureUserExists);

  useEffect(() => {
    if (isAuthenticated) {
      ensureUserExists({}).catch(console.error);
    }
  }, [isAuthenticated, ensureUserExists]);

  return null;
}
