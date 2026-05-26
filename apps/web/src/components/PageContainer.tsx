"use client";

import { ReactNode, useEffect } from "react";
import { motion } from "motion/react";
import { cn, motionDuration, motionEase, motionDistance } from "@vmem/ui";
import { usePageTitle } from "./contexts/PageTitleContext";

interface PageContainerProps {
  title?: string;
  /**
   * Breadcrumb trail shown in the header's left slot. When provided, replaces
   * the large `<h1>` title render — the breadcrumb's final segment identifies
   * the current page. The `title` prop is still used for the browser tab and
   * mobile topbar via the page title context.
   */
  breadcrumb?: ReactNode;
  leftSection?: ReactNode;
  centerSection?: ReactNode;
  rightSection?: ReactNode;
  noScroll?: boolean;
  /** Show title in header row. Defaults to true if sections exist, false otherwise. */
  showTitle?: boolean;
  centeredMaxWidth?: boolean;
  /** Ref callback to access the scroll container (for use with virtualized lists) */
  scrollRef?: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}

export default function PageContainer({
  title,
  breadcrumb,
  leftSection,
  centerSection,
  rightSection,
  noScroll = false,
  showTitle,
  centeredMaxWidth = false,
  scrollRef,
  children,
}: PageContainerProps) {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle(title ?? "");
    return () => setPageTitle("");
  }, [title, setPageTitle]);

  const hasSections = Boolean(leftSection || centerSection || rightSection);
  // Breadcrumb takes precedence over the h1 title — don't render both.
  // Default: show title if sections exist, unless explicitly set.
  const showTitleInHeader =
    !breadcrumb && Boolean(title) && (showTitle ?? hasSections);
  // Title and breadcrumb are desktop-only (md+); mobile uses the shell topbar.
  const hasMobileHeaderContent = hasSections;
  const hasHeader =
    Boolean(breadcrumb) || showTitleInHeader || hasMobileHeaderContent;

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
            "mb-5 flex-shrink-0 px-3 md:px-4",
            hasMobileHeaderContent
              ? "min-h-10 pt-3 md:pt-4"
              : "hidden min-h-10 pt-4 md:block",
          )}
        >
          <div
            className={cn(
              "flex h-10 w-full min-w-0 items-center justify-between gap-2 md:gap-4",
              centeredMaxWidth && "mx-auto w-full max-w-5xl",
            )}
          >
            <div
              className={cn(
                "flex min-w-0 items-center gap-2 md:gap-4",
                ((breadcrumb && !centerSection) || leftSection) &&
                  "min-w-0 flex-1",
              )}
            >
              {breadcrumb ? (
                <motion.div
                  className="hidden min-w-0 flex-1 md:flex"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={childTransition}
                >
                  {breadcrumb}
                </motion.div>
              ) : (
                showTitleInHeader && (
                  <h1 className="hidden min-w-0 truncate text-2xl leading-tight font-instrumentSerif text-foreground md:block">
                    {title}
                  </h1>
                )
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
            {centerSection ? (
              <div className="hidden min-w-0 md:flex md:flex-1 md:justify-center">
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...childTransition, delay: 0.06 }}
                >
                  {centerSection}
                </motion.div>
              </div>
            ) : null}
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
        ref={scrollRef}
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
