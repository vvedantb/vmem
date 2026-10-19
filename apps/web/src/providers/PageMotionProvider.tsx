import { MotionConfig } from "motion/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { PageMotionProvider as UiPageMotionProvider } from "@vvedantb/ui";
import type { ReactNode } from "react";

/**
 * Convex `disablePageMotion` experimental flag (false while flags are loading
 * or when this hook is used outside `PageMotionProvider`).
 */
export { useDisablePageMotion } from "@vvedantb/ui";

/**
 * Nested MotionConfig + `html[data-page-motion]` from the Convex flag.
 * Parent `MotionProvider` already pins `reducedMotion: never` so landing
 * never falls through to Motion's `user` / OS preference.
 */
export function PageMotionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const flags = useQuery(
    api.userSettings.getExperimentalFlags,
    isAuthenticated ? {} : "skip",
  );

  return (
    <UiPageMotionProvider
      disabled={flags?.disablePageMotion === true}
      motionConfig={MotionConfig}
    >
      {children}
    </UiPageMotionProvider>
  );
}
