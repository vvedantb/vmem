import { useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Button,
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogRawContent,
  DialogClose,
  DialogTitle,
  motionDistance,
  motionTiming,
  motionEase,
} from "@vmem/ui";
import { useUser } from "@clerk/clerk-react";
import { useConvexAuth, useAction } from "convex/react";
import { api } from "@vmem/backend";
import { useNotifications } from "./contexts/NotificationContext";
import { useProposals } from "@/hooks/useProposals";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { IconX } from "@tabler/icons-react";
import { MorphingMenuIcon } from "./svg-animations";
import {
  SidebarNavigation,
  navViewFromPathname,
  type SidebarNavView,
} from "./sidebar/SidebarNavigation";
import { SidebarHeader } from "./sidebar/SidebarHeader";
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
  const [navView, setNavView] = useState<SidebarNavView>(() =>
    navViewFromPathname(pathname),
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuId = useId();
  const { isLoaded } = useUser();
  const isAuthLoading = !isLoaded;
  const { unreadCount } = useNotifications();
  const { pendingCount: proposalsCount } = useProposals();
  const { pageTitle } = usePageTitle();

  // Lift stats fetching here so it persists across mobile menu open/close
  const { isAuthenticated } = useConvexAuth();
  const getStats = useAction(api.dashboardApi.getStats);
  const [stats, setStats] = useState<SidebarStats>({ addedToday: 0, total: 0 });

  const refreshStats = useCallback(
    async (fresh: boolean) => {
      try {
        const data = await getStats(fresh ? { fresh: true } : {});
        setStats({
          addedToday: data.memoriesAddedToday,
          total: data.totalMemories,
        });
      } catch {
        // silently fail -- sidebar stats are non-critical
      }
    },
    [getStats],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshStats(false);
  }, [isAuthenticated, refreshStats]);

  // Live updates: the memory-events change feed pushes created/updated/deleted
  // events over Convex's reactive query; refetch stats with the action cache
  // bypassed (the cached entry predates the write). Throttled so a burst
  // (bookmark/history import) collapses into one Neo4j count per window —
  // later batches re-arm the timer, so counts converge after the burst.
  const statsRefetchTimer = useRef<number | null>(null);
  const handleMemoryEvent = useCallback(() => {
    if (statsRefetchTimer.current !== null) return;
    statsRefetchTimer.current = window.setTimeout(() => {
      statsRefetchTimer.current = null;
      void refreshStats(true);
    }, 1500);
  }, [refreshStats]);
  useMemoryEvents(undefined, handleMemoryEvent);

  useEffect(() => {
    return () => {
      if (statsRefetchTimer.current !== null) {
        window.clearTimeout(statsRefetchTimer.current);
      }
    };
  }, []);

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

  const handleSidebarBack = () => setNavView("main");

  const mobileMenuCloseButton = (
    <DialogClose asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Close navigation menu"
        className="rounded-full text-muted transition-colors hover:bg-surface-tertiary/50 hover:text-foreground"
      >
        <IconX className="h-5 w-5" />
      </Button>
    </DialogClose>
  );

  return (
    <>
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <div className="fixed inset-x-0 top-0 z-40 flex min-h-14 items-center gap-3 bg-background px-3 pb-0 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0px,env(safe-area-inset-top))] md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls={mobileMenuId}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-tertiary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <MorphingMenuIcon isOpen={mobileMenuOpen} size={20} />
          </button>
          {pageTitle ? (
            <h1 className="min-w-0 flex-1 truncate text-lg leading-none font-instrumentSerif text-foreground">
              {pageTitle}
            </h1>
          ) : null}
        </div>

        <DialogPortal>
          <DialogOverlay className="md:hidden" />
          <DialogRawContent
            id={mobileMenuId}
            aria-label="Navigation menu"
            className="bg-overlay shadow-lg fixed inset-y-3 left-3 right-3 z-50 flex w-auto max-w-sm flex-col overflow-hidden overscroll-contain rounded-lg text-overlay-foreground outline-none md:hidden"
          >
            <DialogTitle className="sr-only">Navigation menu</DialogTitle>

            <motion.div
              className="flex min-h-0 flex-1 flex-col p-4"
              initial={{ opacity: 0, x: -motionDistance.routeX }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: motionTiming.sidebar, ease: motionEase }}
            >
              <SidebarHeader
                navView={navView}
                isCollapsed={false}
                isMobile
                onBack={handleSidebarBack}
                onToggleCollapse={onToggleCollapse}
                mobileCloseButton={mobileMenuCloseButton}
                onLogoNavigate={() => setMobileMenuOpen(false)}
              />
              <SidebarNavigation
                pathname={pathname}
                unreadCount={unreadCount}
                proposalsCount={proposalsCount}
                isCollapsed={false}
                isMobile
                navView={navView}
                onNavViewChange={setNavView}
                onNavigate={() => setMobileMenuOpen(false)}
              />
              <SidebarFooter
                isCollapsed={false}
                isMobile
                isAuthLoading={isAuthLoading}
                stats={stats}
                showStats={navView === "main"}
              />
            </motion.div>
          </DialogRawContent>
        </DialogPortal>
      </Dialog>

      <motion.aside
        className="fixed left-0 top-0 z-40 hidden h-screen overflow-hidden bg-background md:block"
        animate={{ width: isCollapsed ? 80 : 288 }}
        transition={{ duration: motionTiming.sidebar, ease: motionEase }}
      >
        <div className="flex h-full flex-col p-4 pt-7">
          <SidebarHeader
            navView={navView}
            isCollapsed={isCollapsed}
            isMobile={false}
            onBack={handleSidebarBack}
            onToggleCollapse={onToggleCollapse}
          />

          <SidebarNavigation
            pathname={pathname}
            unreadCount={unreadCount}
            proposalsCount={proposalsCount}
            isCollapsed={isCollapsed}
            isMobile={false}
            navView={navView}
            onNavViewChange={setNavView}
          />

          <SidebarFooter
            isCollapsed={isCollapsed}
            isMobile={false}
            isAuthLoading={isAuthLoading}
            stats={stats}
            showStats={navView === "main"}
          />
        </div>
      </motion.aside>
    </>
  );
}
