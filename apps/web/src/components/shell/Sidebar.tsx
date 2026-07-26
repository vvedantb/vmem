import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
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
import { useConvexAuth, useAction, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { useNotifications } from "@/contexts/NotificationContext";
import { useProposals } from "@/hooks/useProposals";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { IconX } from "@tabler/icons-react";
import { MorphingMenuIcon } from "@/components/icons/animations";
import {
  SidebarNavigation,
  navViewFromPathname,
} from "@/components/sidebar/SidebarNavigation";
import { SidebarHeader } from "@/components/sidebar/SidebarHeader";
import {
  SidebarFooter,
  type SidebarStats,
} from "@/components/sidebar/SidebarFooter";
import { SidebarWorkspaceSwitcher } from "@/components/sidebar/SidebarWorkspaceSwitcher";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { useActiveProfileId } from "@/components/workspace/active-profile";

type SidebarProps = {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
};

export default function Sidebar({
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeProfileId = useActiveProfileId();
  const navView = navViewFromPathname(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuId = useId();
  const { isLoaded } = useUser();
  const isAuthLoading = !isLoaded;
  const { unreadCount } = useNotifications();
  const { pendingCount: proposalsCount } = useProposals();
  const { pageTitle } = usePageTitle();

  // lift stats fetching here so it persists across mobile menu open/close
  const { isAuthenticated } = useConvexAuth();
  const getStats = useAction(api.dashboardApi.getStats);
  const [stats, setStats] = useState<SidebarStats>({ addedToday: 0, total: 0 });

  // whether the active workspace is a team profile — drives the conditional
  // "Team" nav group (members / team settings)
  const profiles = useQuery(api.profiles.list, isAuthenticated ? {} : "skip");
  const isTeamWorkspace =
    profiles?.find((p) => p._id === activeProfileId)?.teamId !== undefined;

  // shared by the mount-effect below and handleMemoryEvent's live-update
  // callback, so it needs a stable identity rather than a plain render-body
  // function
  const refreshStats = useCallback(
    async (fresh: boolean) => {
      // scope counts to the active workspace; without one (fresh browser
      // on /settings) fall back to user-wide totals. Built outside the try
      // because React Compiler bails on a whole file when a conditional
      // expression sits inside a try/catch.
      const args = fresh
        ? { fresh: true, profileId: activeProfileId }
        : { profileId: activeProfileId };
      try {
        const data = await getStats(args);
        setStats({
          addedToday: data.memoriesAddedToday,
          total: data.totalMemories,
        });
      } catch {
        // silently fail -- sidebar stats are non-critical
      }
    },
    [getStats, activeProfileId],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshStats(false);
  }, [isAuthenticated, refreshStats]);

  // live updates: the memory-events change feed pushes created/updated/deleted events
  const statsRefetchTimer = useRef<number | null>(null);
  const handleMemoryEvent = () => {
    if (statsRefetchTimer.current !== null) return;
    statsRefetchTimer.current = window.setTimeout(() => {
      statsRefetchTimer.current = null;
      void refreshStats(true);
    }, 1500);
  };
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

  const isDesktopViewport = useMediaQuery("(min-width: 768px)");
  useEffect(() => {
    if (isDesktopViewport) setMobileMenuOpen(false);
  }, [isDesktopViewport]);

  const handleSidebarBack = () => {
    if (activeProfileId === undefined) {
      void navigate({ to: "/home" });
      return;
    }
    void navigate({
      to: "/$profileId/memories",
      params: { profileId: activeProfileId },
    });
  };

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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls={mobileMenuId}
            className="h-11 w-11 shrink-0 rounded-lg text-muted hover:bg-surface-tertiary/50 hover:text-foreground"
          >
            <MorphingMenuIcon isOpen={mobileMenuOpen} size={20} />
          </Button>
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
              {navView === "main" ? (
                <div className="mb-4">
                  <SidebarWorkspaceSwitcher
                    collapsed={false}
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                </div>
              ) : null}
              <SidebarNavigation
                pathname={pathname}
                profileId={activeProfileId}
                isTeamWorkspace={isTeamWorkspace}
                unreadCount={unreadCount}
                proposalsCount={proposalsCount}
                isCollapsed={false}
                isMobile
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

          {navView === "main" ? (
            <div className="mb-4">
              <SidebarWorkspaceSwitcher collapsed={isCollapsed} />
            </div>
          ) : null}

          <SidebarNavigation
            pathname={pathname}
            profileId={activeProfileId}
            isTeamWorkspace={isTeamWorkspace}
            unreadCount={unreadCount}
            proposalsCount={proposalsCount}
            isCollapsed={isCollapsed}
            isMobile={false}
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
