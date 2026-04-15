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
  hideTitle?: boolean;
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
  hideTitle = false,
  showTitle = false,
  centeredMaxWidth = false,
  children,
}: PageContainerProps) {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    if (hideTitle) {
      setPageTitle("");
      return () => setPageTitle("");
    }
    setPageTitle(title ?? "");
    return () => setPageTitle("");
  }, [title, setPageTitle, hideTitle]);

  const hasSections = leftSection || centerSection || rightSection;
  const showTitleInHeader =
    Boolean(title) && !hideTitle && (showTitle || hasSections);
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
            "mb-5 flex-shrink-0 min-h-10",
            centeredMaxWidth && "flex justify-center",
          )}
        >
          <div
            className={cn(
              "flex h-10 w-full items-center justify-between gap-4",
              centeredMaxWidth && "max-w-3xl",
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
          noScroll ? "overflow-hidden" : "overflow-y-auto pr-1 scrollbar-thin",
        )}
        initial={{ opacity: 0, y: motionDistance.pageY }}
        animate={{ opacity: 1, y: 0 }}
        transition={contentTransition}
      >
        <div
          className={cn(
            noScroll ? "flex-1 min-h-0" : "space-y-8 flex-1",
            centeredMaxWidth && "max-w-3xl mx-auto w-full",
          )}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}
