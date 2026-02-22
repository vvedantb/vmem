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
        className={`relative z-10 mt-16 flex h-[calc(100vh-4rem)] px-2 pb-2 md:mt-0 md:h-screen md:p-4 transition-[margin-left] duration-300 ease-smooth ${
          isSidebarCollapsed ? "md:ml-24" : "md:ml-80"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] bg-card/95 shadow-soft dark:shadow-panel">
          <div className="flex-1 overflow-y-auto px-5 py-5 md:px-8 md:py-7 scrollbar-thin">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
