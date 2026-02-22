"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { fadeUp, motionDuration, motionEase } from "@vmem/ui";

export default function MainTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={fadeUp}
      transition={{ duration: motionDuration.base, ease: motionEase }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
