"use client";

import type { Transition, Variants } from "motion/react";

export const motionEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const motionDuration = {
  fast: 0.28,
  base: 0.42,
  slow: 0.58,
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
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: defaultTransition },
  exit: {
    opacity: 0,
    y: 6,
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

export function staggerContainer(stagger = 0.05, delayChildren = 0): Variants {
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

export const staggerItem: Variants = fadeUp;
