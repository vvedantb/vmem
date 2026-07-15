import type { Transition, Variants } from "motion/react";

export const motionEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const motionDuration = {
  fast: 0.22,
  base: 0.3,
  slow: 0.36,
} as const;

export const motionTiming = {
  route: 0.3,
  sidebar: 0.28,
  stagger: 0.03,
} as const;

export const motionDistance = {
  routeX: 12,
  pageY: 8,
} as const;

export const defaultTransition: Transition = {
  duration: motionDuration.base,
  ease: motionEase,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: motionDistance.pageY },
  show: { opacity: 1, y: 0, transition: defaultTransition },
  exit: {
    opacity: 0,
    y: 6,
    transition: { duration: motionDuration.fast, ease: motionEase },
  },
};
