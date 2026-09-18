import { useLocation } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useMediaQuery } from "usehooks-ts";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { Button, cn, motionEase, motionTiming } from "@vmem/ui";
import { useUser } from "@clerk/clerk-react";
import { useConvexAuth, useAction, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { useNotifications } from "@/contexts/NotificationContext";
import { useProposals } from "@/hooks/useProposals";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { MorphingMenuIcon } from "@/components/icons/animations";
import { SidebarNavigation } from "@/components/sidebar/SidebarNavigation";
import { SidebarHeader } from "@/components/sidebar/SidebarHeader";
import { SidebarHeaderTrailingProvider } from "@/components/sidebar/SidebarHeaderTrailing";
import {
  SidebarFooter,
  type SidebarStats,
} from "@/components/sidebar/SidebarFooter";
import { SidebarWorkspaceSwitcher } from "@/components/sidebar/SidebarWorkspaceSwitcher";
import {
  SidebarRail,
  sidebarRailWidthClass,
} from "@/components/sidebar/SidebarRail";
import {
  panelTitleBySection,
  railSectionFromPathname,
  type SidebarLayout,
} from "@/components/sidebar/nav-config";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { useActiveProfileId } from "@/components/workspace/active-profile";

type SidebarProps = {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSearch: () => void;
};

export default function Sidebar({
  isCollapsed,
  onToggleCollapse,
  onOpenSearch,
}: SidebarProps) {
  const { pathname } = useLocation();
  const activeProfileId = useActiveProfileId();
  const section = railSectionFromPathname(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerTrailing, setHeaderTrailing] = useState<HTMLDivElement | null>(
    null,
  );
  const mobileMenuId = useId();
  const { isLoaded } = useUser();
  const isAuthLoading = !isLoaded;
  const { unreadCount } = useNotifications();
  const { pendingCount: proposalsCount } = useProposals();
  const { pageTitle } = usePageTitle();

  const { isAuthenticated } = useConvexAuth();
  const getStats = useAction(api.dashboardApi.getStats);
  const [stats, setStats] = useState<SidebarStats | null>(null);

  const profiles = useQuery(api.profiles.list, isAuthenticated ? {} : "skip");
  const isTeamWorkspace =
    profiles?.find((p) => p._id === activeProfileId)?.teamId !== undefined;

  const refreshStats = useCallback(
    async (fresh: boolean) => {
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
        // silently fail — sidebar stats are non-critical
      }
    },
    [getStats, activeProfileId],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshStats(false);
  }, [isAuthenticated, refreshStats]);

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

  const isDesktopViewport = useMediaQuery("(min-width: 768px)");
  const layout: SidebarLayout = isDesktopViewport ? "desktop" : "drawer";

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (mobileMenuOpen) setMobileMenuOpen(false);
  }

  useEffect(() => {
    if (isDesktopViewport) setMobileMenuOpen(false);
  }, [isDesktopViewport]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const handleDrawerDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (isDesktopViewport || !mobileMenuOpen) return;
    if (info.offset.x < -72 || info.velocity.x < -500) {
      closeMobileMenu();
    }
  };

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !isDesktopViewport && mobileMenuOpen) {
      closeMobileMenu();
    }
  };

  const showWorkspaceSwitcher =
    section !== "settings" &&
    section !== "skills" &&
    section !== "wiki" &&
    section !== "memories" &&
    section !== "activity";
  const showStats = showWorkspaceSwitcher;
  const titleAlign =
    section === "skills" || section === "wiki" ? "start" : "center";

  return (
    <>
      <header
        onKeyDown={closeOnEscape}
        className="fixed inset-x-0 top-0 z-30 flex h-[var(--vmem-mobile-header-height)] items-center gap-2 bg-background/80 px-3 pt-[env(safe-area-inset-top,0px)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] backdrop-blur-md md:hidden"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-controls={mobileMenuId}
          className="-ml-1 h-11 w-11 shrink-0 rounded-lg text-muted hover:bg-surface-tertiary/50 hover:text-foreground"
        >
          <MorphingMenuIcon isOpen={mobileMenuOpen} size={20} />
        </Button>
        {pageTitle ? (
          <h1 className="pointer-events-none absolute inset-x-14 top-[env(safe-area-inset-top,0px)] bottom-0 flex items-center justify-center truncate text-center text-base font-instrumentSerif font-semibold tracking-[-0.02em] text-foreground text-balance">
            {pageTitle}
          </h1>
        ) : null}
        <div className="ml-auto h-11 w-11 shrink-0" aria-hidden="true" />
      </header>

      <AnimatePresence initial={false}>
        {mobileMenuOpen && !isDesktopViewport ? (
          <motion.button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-backdrop/80 md:hidden"
            onClick={closeMobileMenu}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionTiming.sidebar, ease: motionEase }}
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        id={mobileMenuId}
        data-sidebar-layout={layout}
        inert={!isDesktopViewport && !mobileMenuOpen}
        onKeyDown={closeOnEscape}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex bg-background pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] md:py-0",
          "w-[min(var(--vmem-sidebar-width),calc(100vw-1.5rem))]",
          sidebarRailWidthClass(isCollapsed),
          "md:transition-[width] md:[transition-duration:280ms] md:[transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
        )}
        initial={false}
        animate={{ x: isDesktopViewport || mobileMenuOpen ? 0 : "-100%" }}
        transition={{ duration: motionTiming.sidebar, ease: motionEase }}
        drag={!isDesktopViewport && mobileMenuOpen ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.45, right: 0.08 }}
        onDragEnd={handleDrawerDragEnd}
      >
        <SidebarRail
          layout={layout}
          pathname={pathname}
          profileId={activeProfileId}
          isTeamWorkspace={isTeamWorkspace}
          unreadCount={unreadCount}
          proposalsCount={proposalsCount}
          isCollapsed={isCollapsed}
          isAuthLoading={isAuthLoading}
          onToggleCollapse={onToggleCollapse}
          onOpenSearch={onOpenSearch}
          onNavigate={closeMobileMenu}
        />
        <div
          className={cn(
            // No border-r: MainShell floats the content card (md:p-2 + radius)
            // beside this panel, so a right edge line reads as a hard divider.
            "relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background",
            isCollapsed && "md:hidden",
          )}
        >
          <SidebarHeaderTrailingProvider target={headerTrailing}>
            <div className="px-2 pt-3">
              <SidebarHeader
                title={panelTitleBySection[section]}
                isMobile={!isDesktopViewport}
                onClose={closeMobileMenu}
                titleAlign={titleAlign}
                trailingRef={setHeaderTrailing}
              />
            </div>
            {showWorkspaceSwitcher ? (
              <div className="mb-4 px-4">
                <SidebarWorkspaceSwitcher
                  collapsed={false}
                  onNavigate={closeMobileMenu}
                />
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2">
              <SidebarNavigation
                pathname={pathname}
                profileId={activeProfileId}
                isMobile={!isDesktopViewport}
                onNavigate={closeMobileMenu}
              />
            </div>
            <SidebarFooter
              isMobile={!isDesktopViewport}
              stats={stats ?? { addedToday: 0, total: 0 }}
              showStats={showStats && stats !== null}
            />
          </SidebarHeaderTrailingProvider>
        </div>
      </motion.aside>
    </>
  );
}
