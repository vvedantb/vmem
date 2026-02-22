"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";

export default function MainShell({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="h-screen overflow-hidden bg-sidebar">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />
      <main
        className={`h-[calc(100vh-4rem)] md:h-screen mt-16 md:mt-0 md:p-3 flex transition-[margin-left] duration-300 ease-out ${
          isSidebarCollapsed
            ? "md:ml-[92px]"
            : "md:ml-[clamp(260px,18vw,360px)]"
        }`}
      >
        <div className="flex-1 flex flex-col px-7 py-5 md:rounded-2xl bg-card overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
