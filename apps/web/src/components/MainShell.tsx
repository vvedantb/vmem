"use client";

import { useCallback } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useHotkey } from "@tanstack/react-hotkeys";
import Sidebar from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { PageTitleProvider } from "@/components/contexts/PageTitleContext";
import { WikiSidebarProvider } from "@/components/wiki/WikiSidebarContext";

export default function MainShell({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorage(
    "sidebar-collapsed",
    false,
  );
  const toggleSidebar = useCallback(
    () => setIsSidebarCollapsed((prev) => !prev),
    [],
  );

  useHotkey("Mod+I", toggleSidebar, { preventDefault: true });

  return (
    <PageTitleProvider>
      <WikiSidebarProvider>
        <CommandPalette onToggleSidebar={toggleSidebar} />
        <div className="relative h-screen overflow-hidden bg-background">
          <a
            href="#main-content"
            className="sr-only focus:absolute focus:left-3 focus:top-[max(0.75rem,env(safe-area-inset-top))] focus:z-[100] focus:block focus:rounded-lg focus:bg-surface-secondary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Skip to main content
          </a>
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={toggleSidebar}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className={`relative z-10 flex h-full pt-[calc(3.5rem+env(safe-area-inset-top,0px))] outline-none md:h-screen md:p-2 md:px-2 md:pb-2 md:pt-2 ${
              isSidebarCollapsed ? "md:ml-20" : "md:ml-72"
            } md:transition-[margin-left] md:duration-[280ms] md:ease-[cubic-bezier(0.22,1,0.36,1)]`}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface md:rounded-lg">
              {children}
            </div>
          </main>
        </div>
      </WikiSidebarProvider>
    </PageTitleProvider>
  );
}
