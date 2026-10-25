import { useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { AppSidebar, SidebarPanel } from "@vvedantb/ui";
import { useUser } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { useConvexAuth, useAction, useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { useNotifications } from "@/contexts/NotificationContext";
import { useProposals } from "@/hooks/useProposals";
import { useMemoryEvents } from "@/hooks/useMemoryEvents";
import { MorphingMenuIcon } from "@/components/icons/animations";
import { SidebarNavigation } from "@/components/sidebar/SidebarNavigation";
import { SidebarHeaderTrailingProvider } from "@/components/sidebar/SidebarHeaderTrailing";
import {
  SidebarFooter,
  type SidebarStats,
} from "@/components/sidebar/SidebarFooter";
import { SidebarWorkspaceSwitcher } from "@/components/sidebar/SidebarWorkspaceSwitcher";
import { VProPricingModal } from "@/components/sidebar/VProPricingModal";
import { VmemSidebarRail } from "@/components/sidebar/SidebarRail";
import {
  panelTitleBySection,
  railSectionFromPathname,
  railSectionHidesPanel,
  type SidebarLayout,
} from "@/components/sidebar/nav-config";
import { usePageTitle } from "@/contexts/PageTitleContext";
import { useActiveProfileId } from "@/components/workspace/active-profile";
import { useHasVPlan } from "@/lib/vPlan";
import { VIEW_TRANSITION_TARGET } from "@/lib/view-transitions";

function renderMobileMenuIcon(open: boolean) {
  return <MorphingMenuIcon isOpen={open} size={20} />;
}

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
  // Not persisted: leaving Home/Usage/Inbox/Sources restores the stored
  // collapse state.
  const hidePanel = railSectionHidesPanel(section);
  const panelSection = hidePanel ? null : section;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const hasPro = useHasVPlan();
  const openPricing = () => setPricingOpen(true);
  const [headerTrailing, setHeaderTrailing] = useState<HTMLDivElement | null>(
    null,
  );
  const { isLoaded } = useUser();
  const isAuthLoading = !isLoaded;
  const { unreadCount } = useNotifications();
  const { pendingCount: proposalsCount } = useProposals();
  const { pageTitle } = usePageTitle();

  const { isAuthenticated } = useConvexAuth();
  const getStats = useAction(api.dashboardApi.getStats);
  const queryClient = useQueryClient();
  const [stats, setStats] = useState<SidebarStats | null>(null);

  const profiles = useQuery(api.profiles.list, isAuthenticated ? {} : "skip");
  const isTeamWorkspace =
    profiles?.find((p) => p._id === activeProfileId)?.teamId !== undefined;

  // shares the ["dashboard-stats", profileId] cache entry with the dashboard
  // page, so the sidebar and dashboard reuse one whole-table stats walk
  // (in-flight dedupe + 30s staleTime) instead of each running their own
  const refreshStats = useCallback(
    async (fresh: boolean) => {
      const args = fresh
        ? { fresh: true, profileId: activeProfileId }
        : { profileId: activeProfileId };
      const staleTime = fresh ? 0 : 30_000;
      try {
        const data = await queryClient.fetchQuery({
          queryKey: ["dashboard-stats", activeProfileId],
          queryFn: async () => await getStats(args),
          staleTime,
        });
        setStats({
          addedToday: data.memoriesAddedToday,
          total: data.totalMemories,
        });
      } catch {
        // silently fail — sidebar stats are non-critical
      }
    },
    [getStats, queryClient, activeProfileId],
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

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const showWorkspaceSwitcher =
    section !== "settings" && section !== "skills" && section !== "memories";
  const showStats = showWorkspaceSwitcher;

  return (
    <>
      <AppSidebar
        isDesktop={isDesktopViewport}
        collapsed={isCollapsed}
        panelHidden={hidePanel}
        mobileOpen={mobileMenuOpen}
        onMobileOpenChange={setMobileMenuOpen}
        asideProps={{ "data-vt": VIEW_TRANSITION_TARGET.sidebar }}
        mobileTitle={pageTitle}
        mobileMenuIcon={renderMobileMenuIcon}
        rail={
          <VmemSidebarRail
            layout={layout}
            pathname={pathname}
            profileId={activeProfileId}
            isTeamWorkspace={isTeamWorkspace}
            unreadCount={unreadCount}
            proposalsCount={proposalsCount}
            isCollapsed={isCollapsed}
            isPanelHidden={hidePanel}
            isAuthLoading={isAuthLoading}
            onToggleCollapse={onToggleCollapse}
            onOpenSearch={onOpenSearch}
            onUpgrade={openPricing}
            onNavigate={closeMobileMenu}
          />
        }
        panel={
          panelSection === null ? null : (
            <SidebarHeaderTrailingProvider target={headerTrailing}>
              <SidebarPanel
                title={panelTitleBySection[panelSection]}
                collapsed={isCollapsed}
                headerTrailing={
                  <div ref={setHeaderTrailing} className="flex items-center" />
                }
                onClose={isDesktopViewport ? undefined : closeMobileMenu}
                closeButtonClassName="transition-colors"
              >
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
                  onUpgrade={openPricing}
                />
              </SidebarPanel>
            </SidebarHeaderTrailingProvider>
          )
        }
      />
      {hasPro ? null : (
        <VProPricingModal
          open={pricingOpen}
          onClose={() => setPricingOpen(false)}
        />
      )}
    </>
  );
}
