"use client";

import { ReactNode, useEffect } from "react";
import { motion } from "motion/react";
import { motionDuration, motionEase, motionDistance } from "@vmem/ui";
import { usePageTitle } from "./contexts/PageTitleContext";

interface PageContainerProps {
  title?: string;
  leftSection?: ReactNode;
  centerSection?: ReactNode;
  rightSection?: ReactNode;
  children: ReactNode;
}

export default function PageContainer({
  title,
  leftSection,
  centerSection,
  rightSection,
  children,
}: PageContainerProps) {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle(title ?? "");
    return () => setPageTitle("");
  }, [title, setPageTitle]);

  const hasHeader = leftSection || centerSection || rightSection;
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
      {hasHeader && (
        <div className="mb-5 flex-shrink-0 min-h-10">
          <div className="flex h-10 items-center justify-between gap-4">
            {leftSection && (
              <motion.div
                className="flex-shrink-0 mr-auto"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={childTransition}
              >
                {leftSection}
              </motion.div>
            )}
            <div className="hidden md:flex md:flex-1 md:justify-center">
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
            {rightSection && (
              <motion.div
                className="flex-shrink-0 ml-auto"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...childTransition, delay: 0.1 }}
              >
                {rightSection}
              </motion.div>
            )}
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
      )}
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
