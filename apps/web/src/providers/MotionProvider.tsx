import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { defaultTransition } from "@vv/ui";

interface MotionProviderProps {
  children: ReactNode;
}

/**
 * App-wide Motion defaults. `reducedMotion: never` is the product default;
 * signed-in users can override via the Convex `disablePageMotion` flag,
 * applied by `PageMotionProvider`.
 */
export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <MotionConfig reducedMotion="never" transition={defaultTransition}>
      {children}
    </MotionConfig>
  );
}
