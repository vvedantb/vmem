"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";

export default function MainShell({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="relative h-screen overflow-hidden bg-sidebar">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />
      <main
        className={`relative z-10 flex h-full box-border md:px-2 md:pb-2 pt-12 md:h-screen md:p-2 transition-all duration-300 ease-smooth ${
          isSidebarCollapsed ? "md:ml-24" : "md:ml-80"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:rounded-3xl bg-card/95 shadow-soft dark:shadow-panel">
          <div className="flex-1 overflow-y-auto p-3 md:p-5 scrollbar-thin">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
