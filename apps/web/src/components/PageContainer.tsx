"use client";

import { ReactNode, useEffect } from "react";
import { motion } from "motion/react";
import { cn, motionDuration, motionEase, motionDistance } from "@vmem/ui";
import { usePageTitle } from "./contexts/PageTitleContext";

interface PageContainerProps {
  title?: string;
  leftSection?: ReactNode;
  centerSection?: ReactNode;
  rightSection?: ReactNode;
  noScroll?: boolean;
  /** Show title in header row. Defaults to true if sections exist, false otherwise. */
  showTitle?: boolean;
  centeredMaxWidth?: boolean;
  children: ReactNode;
}

export default function PageContainer({
  title,
  leftSection,
  centerSection,
  rightSection,
  noScroll = false,
  showTitle,
  centeredMaxWidth = false,
  children,
}: PageContainerProps) {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle(title ?? "");
    return () => setPageTitle("");
  }, [title, setPageTitle]);

  const hasSections = leftSection || centerSection || rightSection;
  // Default: show title if sections exist, unless explicitly set
  const showTitleInHeader =
    Boolean(title) && (showTitle ?? Boolean(hasSections));
  const hasHeader = showTitleInHeader || hasSections;

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
        <div
          className={cn(
            "mb-5 flex-shrink-0 min-h-10 px-3 pt-3 md:px-4 md:pt-4",
            centeredMaxWidth && "flex justify-center",
          )}
        >
          <div
            className={cn(
              "flex h-10 w-full items-center justify-between gap-4",
              centeredMaxWidth && "max-w-5xl",
            )}
          >
            <div className="flex min-w-0 flex-shrink-0 items-center gap-4">
              {showTitleInHeader && (
                <h1 className="hidden min-w-0 truncate text-2xl leading-tight font-instrumentSerif text-foreground md:block">
                  {title}
                </h1>
              )}
              {leftSection && (
                <motion.div
                  className="flex-shrink-0"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={childTransition}
                >
                  {leftSection}
                </motion.div>
              )}
            </div>
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
        className={cn(
          "min-h-0 flex-1 flex flex-col",
          noScroll ? "overflow-hidden" : "overflow-y-auto scrollbar-thin",
        )}
        initial={{ opacity: 0, y: motionDistance.pageY }}
        animate={{ opacity: 1, y: 0 }}
        transition={contentTransition}
      >
        <div
          className={cn(
            noScroll ? "flex-1 min-h-0" : "space-y-8 flex-1",
            centeredMaxWidth && "max-w-5xl mx-auto w-full",
            "px-3 pb-3 md:px-4 md:pb-4",
            !hasHeader && "pt-3 md:pt-4",
          )}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}
