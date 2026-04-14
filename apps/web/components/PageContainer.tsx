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
  centeredMaxWidth = false,
  children,
}: PageContainerProps) {
  const { setPageTitle } = usePageTitle();
  const showInPageHeading = Boolean(title) && !hideTitle;

  useEffect(() => {
    if (hideTitle) {
      setPageTitle("");
      return () => setPageTitle("");
    }
    setPageTitle(title ?? "");
    return () => setPageTitle("");
  }, [title, setPageTitle, hideTitle]);

  const hasHeader = Boolean(leftSection || centerSection || rightSection);
  const mergeTitleIntoHeader = showInPageHeading && hasHeader;
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
      <div
        className={cn(
          "flex min-h-0 flex-1",
          centeredMaxWidth ? "flex-row justify-center" : "flex-col",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 w-full min-w-0 flex-col",
            centeredMaxWidth ? "h-full max-w-3xl shrink-0" : "flex-1",
          )}
        >
          {hasHeader && (
            <div className="mb-5 flex-shrink-0 min-h-10">
              <div className="flex h-10 items-center justify-between gap-4">
                {(leftSection || mergeTitleIntoHeader) && (
                  <div className="flex min-w-0 flex-shrink-0 items-center gap-4">
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
                    {mergeTitleIntoHeader ? (
                      <h1 className="hidden min-w-0 truncate text-2xl leading-tight font-instrumentSerif text-foreground md:block">
                        {title}
                      </h1>
                    ) : null}
                  </div>
                )}
                <div className="hidden min-w-0 flex-1 justify-center md:flex">
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
              noScroll
                ? "overflow-hidden"
                : "overflow-y-auto pr-1 scrollbar-thin",
            )}
            initial={{ opacity: 0, y: motionDistance.pageY }}
            animate={{ opacity: 1, y: 0 }}
            transition={contentTransition}
          >
            <div
              className={cn(
                noScroll
                  ? "flex min-h-0 flex-1 flex-col"
                  : "flex flex-1 flex-col space-y-8",
              )}
            >
              <div className="flex min-h-0 w-full flex-col">
                {showInPageHeading && !mergeTitleIntoHeader ? (
                  <h1 className="mb-6 hidden text-2xl leading-tight font-instrumentSerif text-foreground md:block">
                    {title}
                  </h1>
                ) : null}
                {children}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
