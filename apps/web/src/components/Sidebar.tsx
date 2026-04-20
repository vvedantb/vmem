import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Button,
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogRawContent,
  DialogClose,
  DialogTitle,
  cn,
  motionDistance,
  motionDuration,
  motionEase,
  motionTiming,
} from "@vmem/ui";
import { useThemeContext } from "./contexts/ThemeContext";
import { useUser } from "@clerk/clerk-react";
import { useConvexAuth, useAction } from "convex/react";
import { api } from "@vmem/backend";
import { useNotifications } from "./contexts/NotificationContext";
import {
  IconX,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpandFilled,
} from "@tabler/icons-react";
import { MorphingMenuIcon } from "./svg-animations";
import { SidebarNavigation } from "./sidebar/SidebarNavigation";
import { SidebarFooter, type SidebarStats } from "./sidebar/SidebarFooter";
import { usePageTitle } from "./contexts/PageTitleContext";

type SidebarProps = {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
};

export default function Sidebar({
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuId = useId();
  const { theme, toggleTheme, mounted } = useThemeContext();
  const { isLoaded } = useUser();
  const isAuthLoading = !isLoaded;
  const { unreadCount } = useNotifications();
  const { pageTitle } = usePageTitle();

  const isDark = theme === "dark";

  // Lift stats fetching here so it persists across mobile menu open/close
  const { isAuthenticated } = useConvexAuth();
  const getStats = useAction(api.dashboardApi.getStats);
  const [stats, setStats] = useState<SidebarStats>({ addedToday: 0, total: 0 });

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await getStats({});
        const result = data as {
          memoriesAddedToday: number;
          totalMemories: number;
        };
        if (!cancelled) {
          setStats({
            addedToday: result.memoriesAddedToday,
            total: result.totalMemories,
          });
        }
      } catch {
        // silently fail -- sidebar stats are non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileMenuOpen(false);
      }
    };

    mediaQuery.addEventListener("change", closeOnDesktop);
    return () => mediaQuery.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <>
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 px-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls={mobileMenuId}
            className="flex h-9 w-9 items-center justify-center rounded-xl glass-interactive text-muted-foreground transition-colors hover:text-foreground"
          >
            <MorphingMenuIcon isOpen={mobileMenuOpen} size={20} />
          </button>
          {pageTitle ? (
            <span className="text-lg leading-none font-instrumentSerif text-foreground">
              {pageTitle}
            </span>
          ) : null}
        </div>

        <DialogPortal>
          <DialogOverlay className="bg-black/50 md:hidden" />
          <DialogRawContent
            id={mobileMenuId}
            aria-label="Navigation menu"
            className="glass-panel-strong fixed inset-y-3 left-3 right-3 z-50 flex w-auto max-w-sm flex-col overflow-hidden rounded-3xl text-foreground outline-none md:hidden"
          >
            <DialogTitle className="sr-only">Navigation menu</DialogTitle>

            <motion.div
              className="flex min-h-0 flex-1 flex-col p-4"
              initial={{ opacity: 0, x: -motionDistance.routeX }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: motionTiming.sidebar, ease: motionEase }}
            >
              <div className="mb-4 flex items-center justify-between pl-4 pr-2 py-2">
                <Link
                  to="/home"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-row items-center gap-2"
                >
                  <img
                    width={22}
                    height={22}
                    alt="vmem icon"
                    src="/icon-dark.svg"
                    className="block dark:hidden"
                  />
                  <img
                    width={22}
                    height={22}
                    src="/icon-light.svg"
                    alt="vmem icon"
                    className="hidden dark:block"
                  />
                  <h1 className="text-xl leading-none font-instrumentSerif text-foreground">
                    v<span className="italic">mem</span>
                  </h1>
                </Link>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close navigation menu"
                    className="glass-interactive rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <IconX className="h-5 w-5" />
                  </Button>
                </DialogClose>
              </div>
              <SidebarNavigation
                pathname={pathname}
                unreadCount={unreadCount}
                isCollapsed={false}
                isMobile
                onNavigate={() => setMobileMenuOpen(false)}
              />
              <SidebarFooter
                isCollapsed={false}
                isMobile
                mounted={mounted}
                isDark={isDark}
                toggleTheme={toggleTheme}
                isAuthLoading={isAuthLoading}
                stats={stats}
              />
            </motion.div>
          </DialogRawContent>
        </DialogPortal>
      </Dialog>

      <motion.aside
        className="fixed left-0 top-0 z-40 hidden h-screen overflow-hidden bg-sidebar md:block"
        animate={{ width: isCollapsed ? 80 : 288 }}
        transition={{ duration: motionTiming.sidebar, ease: motionEase }}
      >
        <div className="flex h-full flex-col p-4 pt-7">
          <div
            className={cn(
              "mb-6 flex",
              isCollapsed
                ? "flex-col items-center gap-3"
                : "flex-row items-center justify-between px-2 pb-4 pl-4",
            )}
          >
            <Link
              to="/home"
              className={cn(
                "flex flex-row items-center",
                !isCollapsed && "gap-2",
              )}
            >
              <img
                width={22}
                height={22}
                alt="vmem icon"
                src="/icon-dark.svg"
                className="mt-1 block dark:hidden"
              />
              <img
                width={22}
                height={22}
                src="/icon-light.svg"
                alt="vmem icon"
                className="mt-1 hidden dark:block"
              />
              <AnimatePresence initial={false}>
                {!isCollapsed ? (
                  <motion.h1
                    key="desktop-logo"
                    className="mt-0.5 text-xl font-instrumentSerif text-foreground"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: motionDuration.fast,
                      ease: motionEase,
                    }}
                  >
                    v<span className="italic">mem</span>
                  </motion.h1>
                ) : null}
              </AnimatePresence>
            </Link>
            <div
              className={cn(
                "flex items-center",
                isCollapsed ? "flex-col gap-2" : "flex-row justify-end gap-2",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onToggleCollapse}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="glass-interactive rounded-lg text-muted-foreground hover:text-foreground"
              >
                {isCollapsed ? (
                  <IconLayoutSidebarLeftExpandFilled className="h-4 w-4" />
                ) : (
                  <IconLayoutSidebarLeftCollapse className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <SidebarNavigation
            pathname={pathname}
            unreadCount={unreadCount}
            isCollapsed={isCollapsed}
            isMobile={false}
          />

          <SidebarFooter
            isCollapsed={isCollapsed}
            isMobile={false}
            mounted={mounted}
            isDark={isDark}
            toggleTheme={toggleTheme}
            isAuthLoading={isAuthLoading}
            stats={stats}
          />
        </div>
      </motion.aside>
    </>
  );
}
