"use client";

import { useCallback } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useHotkey } from "@tanstack/react-hotkeys";
import Sidebar from "@/components/Sidebar";
import { PageTitleProvider } from "@/components/contexts/PageTitleContext";

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
      <div className="relative h-screen overflow-hidden bg-[#ffffff] dark:bg-[#222222] md:bg-sidebar md:dark:bg-sidebar">
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
        <main
          className={`relative z-10 flex h-full pt-14 md:h-screen md:p-2 md:px-2 md:pb-2 ${
            isSidebarCollapsed ? "md:ml-20" : "md:ml-72"
          } md:transition-[margin-left] md:duration-[280ms] md:ease-[cubic-bezier(0.22,1,0.36,1)]`}
        >
          <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden md:rounded-3xl">
            <div className="flex-1 overflow-y-auto p-3 md:p-4 scrollbar-thin">
              {children}
            </div>
          </div>
        </main>
      </div>
    </PageTitleProvider>
  );
}
