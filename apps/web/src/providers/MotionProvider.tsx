import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { defaultTransition } from "@vmem/ui";

interface MotionProviderProps {
  children: ReactNode;
}

export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <MotionConfig reducedMotion="never" transition={defaultTransition}>
      {children}
    </MotionConfig>
  );
}
