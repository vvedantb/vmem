import { useEffect } from "react";
import { api } from "@vmem/backend";
import { useEnsureUser } from "@vvedantb/convex-client";
import { startUpdateAvailableWatcher } from "@vvedantb/ui";
import { toast } from "sonner";
import { convex } from "@/lib/convex-client";

export function EnsureUser() {
  useEnsureUser(api.auth.ensureUserExists);
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
