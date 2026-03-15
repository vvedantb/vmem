"use client";

import { ReactNode } from "react";
import { motion } from "motion/react";
import { motionDuration, motionEase, motionDistance } from "@vmem/ui";

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
  const childTransition = {
    duration: motionDuration.fast,
    ease: motionEase,
  } as const;

  const contentTransition = {
    duration: motionDuration.base,
    ease: motionEase,
    delay: 0.12,
  } as const;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 flex-shrink-0 min-h-10">
        <div className="flex h-10 items-center justify-between gap-4 md:grid md:grid-cols-[1fr_auto_1fr]">
          <motion.h2
            className="text-2xl leading-tight font-instrumentSerif text-foreground"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={childTransition}
          >
            {title}
          </motion.h2>
          <div className="hidden md:flex md:justify-center">
            {centerSection && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...childTransition, delay: 0.06 }}
              >
                {centerSection}
              </motion.div>
            )}
          </div>
          <div className="md:flex md:justify-end">
            {rightSection && (
              <motion.div
                className="flex-shrink-0"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...childTransition, delay: 0.1 }}
              >
                {rightSection}
              </motion.div>
            )}
          </div>
        </div>
        {centerSection && (
          <motion.div
            className="mt-3 flex justify-center md:hidden"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...childTransition, delay: 0.06 }}
          >
            {centerSection}
          </motion.div>
        )}
      </div>
      <motion.div
        className="min-h-0 flex-1 flex flex-col overflow-y-auto pr-1 scrollbar-thin"
        initial={{ opacity: 0, y: motionDistance.pageY }}
        animate={{ opacity: 1, y: 0 }}
        transition={contentTransition}
      >
        <div className="space-y-8 flex-1">{children}</div>
      </motion.div>
    </div>
  );
}
