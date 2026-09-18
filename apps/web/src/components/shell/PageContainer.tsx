import type { ReactNode } from "react";
import { useEffect } from "react";
import { motion } from "motion/react";
import { cn, motionDuration, motionEase, motionDistance } from "@vmem/ui";
import { usePageTitle } from "@/contexts/PageTitleContext";

interface PageContainerProps {
  title?: string;
  // breadcrumb trail shown in the header's left slot
  breadcrumb?: ReactNode;
  leftSection?: ReactNode;
  centerSection?: ReactNode;
  rightSection?: ReactNode;
  /**
   * Secondary refine row under the title (filters, search, segmented controls).
   * Kept out of `rightSection` so the title row stays quiet. Eva `toolbar`.
   */
  toolbar?: ReactNode;
  /** Route / view tabs under the title (and under toolbar when both exist). */
  tabs?: ReactNode;
  /**
   * Indent the title row by the card gutter (`px-4`) so the page title lines up
   * with the section titles inside the cards below. Eva `insetHeader`.
   */
  insetHeader?: boolean;
  noScroll?: boolean;
  // show title in header row
  showTitle?: boolean;
  centeredMaxWidth?: boolean;
  // ref callback to access the scroll container (for use with virtualised lists)
  scrollRef?: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}

/**
 * Page chrome: title row, optional toolbar/tabs, then the scrolling body.
 * Mirrors Eva `PageWrapper` + `PageHeader` — no separate header background.
 */
export default function PageContainer({
  title,
  breadcrumb,
  leftSection,
  centerSection,
  rightSection,
  toolbar,
  tabs,
  insetHeader = false,
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
  const hasToolbar = toolbar != null;
  const hasTabs = tabs != null;
  // breadcrumb takes precedence over the h1 title don't render both
  // default show title if sections exist, unless explicitly set
  const showTitleInHeader =
    !breadcrumb && Boolean(title) && (showTitle ?? hasSections);
  const hasLeftChrome = Boolean(
    breadcrumb || showTitleInHeader || leftSection || centerSection,
  );
  // title and breadcrumb are desktop only (md+) mobile uses the shell topbar
  const hasMobileHeaderContent = hasSections || hasToolbar || hasTabs;
  const hasHeader =
    Boolean(breadcrumb) ||
    showTitleInHeader ||
    hasMobileHeaderContent ||
    hasToolbar ||
    hasTabs;
  const hasHeaderRight = rightSection != null;

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
            "relative flex-shrink-0 p-3 sm:px-4",
            hasMobileHeaderContent ? null : "hidden md:block",
            centeredMaxWidth && "mx-auto w-full max-w-5xl",
          )}
        >
          <div
            className={cn(
              "relative items-center gap-2 sm:gap-3",
              hasHeaderRight && hasLeftChrome
                ? "grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
                : hasHeaderRight
                  ? "flex justify-end"
                  : "grid grid-cols-1",
              insetHeader && "px-4",
            )}
          >
            {hasLeftChrome ? (
              <div
                className={cn(
                  "flex min-w-0 items-center gap-2 sm:gap-3",
                  hasHeaderRight && !centerSection ? "md:col-span-2" : null,
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
                    <h1 className="hidden min-w-0 flex-1 truncate text-lg font-instrumentSerif font-semibold tracking-[-0.02em] text-foreground text-balance md:block md:text-xl">
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
            ) : null}
            {centerSection ? (
              <div className="hidden min-w-0 justify-center md:flex">
                <motion.div
                  className="w-full max-w-xl"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...childTransition, delay: 0.06 }}
                >
                  {centerSection}
                </motion.div>
              </div>
            ) : null}
            {hasHeaderRight ? (
              <motion.div
                className="flex min-h-10 max-sm:min-w-0 max-sm:flex-wrap items-center justify-end gap-1.5 sm:gap-2 justify-self-end"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...childTransition, delay: 0.1 }}
              >
                {rightSection}
              </motion.div>
            ) : null}
          </div>
          {centerSection && (
            <motion.div
              className="mt-2 md:hidden"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...childTransition, delay: 0.06 }}
            >
              {centerSection}
            </motion.div>
          )}
          {hasToolbar || hasTabs ? (
            <div className={cn("mt-3 space-y-3", insetHeader && "px-4")}>
              {hasToolbar ? (
                <div className="flex min-h-9 flex-wrap items-center gap-1.5 sm:gap-2">
                  {toolbar}
                </div>
              ) : null}
              {hasTabs ? (
                <div className="min-w-0 max-sm:max-w-full max-sm:overflow-x-auto">
                  {tabs}
                </div>
              ) : null}
            </div>
          ) : null}
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
            noScroll
              ? "flex h-full min-h-0 flex-1 flex-col"
              : "flex-1 space-y-8",
            centeredMaxWidth && "max-w-5xl mx-auto w-full",
            hasHeader
              ? "px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-4 md:pb-4"
              : "px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 sm:px-4 md:pb-4 md:pt-4",
          )}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}
