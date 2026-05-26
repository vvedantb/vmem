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
        <div className="relative h-screen overflow-hidden bg-surface-secondary md:bg-surface-secondary">
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={toggleSidebar}
          />
          <main
            className={`relative z-10 flex h-full pt-14 md:h-screen md:p-2 md:px-2 md:pb-2 ${
              isSidebarCollapsed ? "md:ml-20" : "md:ml-72"
            } md:transition-[margin-left] md:duration-[280ms] md:ease-[cubic-bezier(0.22,1,0.36,1)]`}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:rounded-lg">
              {children}
            </div>
          </main>
        </div>
      </WikiSidebarProvider>
    </PageTitleProvider>
  );
}
