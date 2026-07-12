"use client";

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

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: defaultTransition },
  exit: {
    opacity: 0,
    transition: { duration: motionDuration.fast, ease: motionEase },
  },
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

export const routeSlideFade: Variants = {
  hidden: { opacity: 0, x: -motionDistance.routeX },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: motionTiming.route, ease: motionEase },
  },
  exit: {
    opacity: 0,
    x: -6,
    transition: { duration: motionDuration.fast, ease: motionEase },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  show: { opacity: 1, scale: 1, transition: defaultTransition },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: motionDuration.fast, ease: motionEase },
  },
};

export function staggerContainer(
  stagger = motionTiming.stagger,
  delayChildren = 0,
): Variants {
  return {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        when: "beforeChildren",
        delayChildren,
        staggerChildren: stagger,
      },
    },
    exit: {
      opacity: 0,
      transition: {
        when: "afterChildren",
        staggerChildren: Math.max(0.01, stagger / 2),
        staggerDirection: -1,
      },
    },
  };
}

export const staggerItem: Variants = {
  hidden: fadeUp.hidden,
  show: fadeUp.show,
  exit: fadeUp.exit,
};
