import { useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useLocation } from "@tanstack/react-router";
import { AppShell } from "@vvedantb/ui";
import Sidebar from "@/components/shell/Sidebar";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { PageTitleProvider } from "@/contexts/PageTitleContext";
import {
  railSectionFromPathname,
  railSectionHidesPanel,
} from "@/components/sidebar/nav-config";

export default function MainShell({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorage(
    "sidebar-collapsed",
    false,
  );
  const pathname = useLocation({ select: (location) => location.pathname });
  const isPanelHidden =
    isSidebarCollapsed ||
    railSectionHidesPanel(railSectionFromPathname(pathname));
  const [commandOpen, setCommandOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarCollapsed((prev) => !prev);

  useHotkey("Mod+I", toggleSidebar, { preventDefault: true });

  return (
    <PageTitleProvider>
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onToggleSidebar={toggleSidebar}
      />
      <AppShell
        railWidth="var(--vmem-sidebar-rail-width)"
        sidebarWidth="var(--vmem-sidebar-width)"
        mobileHeaderHeight="var(--vmem-mobile-header-height)"
        panelHidden={isPanelHidden}
        sidebar={
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            onOpenSearch={() => setCommandOpen(true)}
          />
        }
      >
        {children}
      </AppShell>
    </PageTitleProvider>
  );
}
