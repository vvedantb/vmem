"use client";

import { ReactNode } from "react";
import { motion } from "motion/react";
import {
  motionDuration,
  motionEase,
  staggerContainer,
  staggerItem,
} from "@vmem/ui";

interface PageContainerProps {
  title: string;
  centerSection?: ReactNode;
  rightSection?: ReactNode;
  children: ReactNode;
}

export default function PageContainer({
  title,
  centerSection,
  rightSection,
  children,
}: PageContainerProps) {
  return (
    <motion.div
      className="flex h-full min-h-0 flex-col"
      variants={staggerContainer(0.05, 0.03)}
      initial="hidden"
      animate="show"
    >
      <motion.div className="mb-5 flex-shrink-0" variants={staggerItem}>
        <div className="flex items-center justify-between gap-4 md:relative">
          <motion.h2
            className="text-2xl leading-tight font-instrumentSerif text-foreground"
            variants={staggerItem}
          >
            {title}
          </motion.h2>
          {centerSection && (
            <motion.div
              className="absolute left-1/2 hidden -translate-x-1/2 md:block"
              variants={staggerItem}
            >
              {centerSection}
            </motion.div>
          )}
          {rightSection && (
            <motion.div className="flex-shrink-0" variants={staggerItem}>
              {rightSection}
            </motion.div>
          )}
        </div>
        {centerSection && (
          <motion.div
            className="mt-3 flex justify-center md:hidden"
            variants={staggerItem}
          >
            {centerSection}
          </motion.div>
        )}
      </motion.div>
      <motion.div
        className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin"
        variants={staggerItem}
      >
        <motion.div
          className="space-y-8 pb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionDuration.slow, ease: motionEase }}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
