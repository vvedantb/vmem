import { useEffect } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { startUpdateAvailableWatcher } from "@vvedantb/ui/app";
import { toast } from "sonner";
import { convex } from "@/lib/convex-client";

export function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensureUserExists = useMutation(api.auth.ensureUserExists);

  useEffect(() => {
    if (isAuthenticated) {
      ensureUserExists({}).catch(console.error);
    }
  }, [isAuthenticated, ensureUserExists]);

  return null;
}

/** Mount-only production deploy poll — effect lives here (grandfathered). */
export function useUpdateAvailableToast() {
  useEffect(() => {
    return startUpdateAvailableWatcher({
      origin: window.location.origin,
      toast,
      closeConvex: () => void convex.close(),
      enabled: !import.meta.env.DEV,
    });
  }, []);
}
