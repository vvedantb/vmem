"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { routeSlideFade } from "@vmem/ui";

export default function MainTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={routeSlideFade}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
