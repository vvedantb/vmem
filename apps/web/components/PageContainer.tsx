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
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* Header stays at full width but content inside is centered */}
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
              className={cn(
                "mt-3 flex justify-center md:hidden",
                centeredMaxWidth && "max-w-3xl mx-auto",
              )}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...childTransition, delay: 0.06 }}
            >
              {centerSection}
            </motion.div>
          )}
        </div>
      )}
      {/* Scroll container at full width, content centered inside */}
      <div
        className={cn(
          "min-h-0 flex-1 flex flex-col",
          noScroll ? "overflow-hidden" : "overflow-y-auto pr-1 scrollbar-thin",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 w-full flex-col",
            centeredMaxWidth && "max-w-3xl mx-auto",
            noScroll && "flex-1",
          )}
        >
          <motion.div
            className={cn(
              noScroll
                ? "flex min-h-0 flex-1 flex-col"
                : "flex flex-col space-y-8",
            )}
            initial={{ opacity: 0, y: motionDistance.pageY }}
            animate={{ opacity: 1, y: 0 }}
            transition={contentTransition}
          >
            <div
              className={cn(
                "flex min-h-0 w-full flex-col",
                noScroll && "flex-1",
              )}
            >
              {showInPageHeading && !mergeTitleIntoHeader ? (
                <h1 className="mb-6 hidden text-2xl leading-tight font-instrumentSerif text-foreground md:block">
                  {title}
                </h1>
              ) : null}
              {children}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
