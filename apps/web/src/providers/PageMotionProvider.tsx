import { MotionConfig } from "motion/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import {
  createContext,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { slidesPublicBoot } from "@/lib/slides-public-boot";

const PageMotionContext = createContext(false);

/** Stamp `html[data-page-motion]` so CSS page/route view transitions skip. */
function applyPageMotionDataset(disabled: boolean): void {
  document.documentElement.dataset.pageMotion = disabled ? "off" : "on";
}

/**
 * Convex `disablePageMotion` experimental flag (false while flags are loading
 * or when this hook is used outside `PageMotionProvider`).
 */
export function useDisablePageMotion(): boolean {
  return useContext(PageMotionContext);
}

/**
 * Nested MotionConfig + `html[data-page-motion]` from the Convex flag.
 * Parent `MotionProvider` already pins `reducedMotion: never` so landing
 * never falls through to Motion's `user` / OS preference.
 */
export function PageMotionProvider({ children }: { children: ReactNode }) {
  // `/slides` boots with anonymous ConvexProvider (no Clerk /
  // ConvexProviderWithAuth). Auth hooks throw without that provider.
  if (slidesPublicBoot) {
    return children;
  }
  return <PageMotionProviderWhenAuth>{children}</PageMotionProviderWhenAuth>;
}

function PageMotionProviderWhenAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const flags = useQuery(
    api.userSettings.getExperimentalFlags,
    isAuthenticated ? {} : "skip",
  );
  const disabled = flags?.disablePageMotion === true;

  useLayoutEffect(() => {
    applyPageMotionDataset(disabled);
  }, [disabled]);

  return (
    <PageMotionContext.Provider value={disabled}>
      <MotionConfig reducedMotion={disabled ? "always" : "never"}>
        {children}
      </MotionConfig>
    </PageMotionContext.Provider>
  );
}
