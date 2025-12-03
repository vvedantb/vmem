"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Switch, Divider } from "@heroui/react";
import { useThemeContext } from "./contexts/ThemeContext";
import {
  IconMessageCircle,
  IconBrain,
  IconLayoutDashboard,
  IconKey,
  IconFileText,
  IconBell,
  IconUser,
  IconSettings,
  IconMenu2,
  IconX,
  IconFiles,
  IconPlugConnected,
  IconMoon,
  IconSun,
} from "@tabler/icons-react";

const navGroups = [
  {
    items: [
      { href: "/chat", label: "Chat", icon: IconMessageCircle },
      { href: "/memories", label: "Memories", icon: IconBrain },
      { href: "/dashboard", label: "Dashboard", icon: IconLayoutDashboard },
    ],
  },
  {
    items: [
      { href: "/files", label: "Files", icon: IconFiles },
      { href: "/connectors", label: "Connectors", icon: IconPlugConnected },
    ],
  },
  {
    items: [
      { href: "/api-keys", label: "API Keys", icon: IconKey },
      { href: "/api-logs", label: "API Logs", icon: IconFileText },
    ],
  },
  {
    items: [
      { href: "/notifications", label: "Notifications", icon: IconBell },
      { href: "/profile", label: "Profile", icon: IconUser },
      { href: "/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, toggleTheme, mounted } = useThemeContext();

  const isDark = theme === "dark";

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 bg-neutral-200 dark:bg-black z-50 md:hidden flex items-center justify-between px-6">
        <h1 className="text-xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
          vmem
        </h1>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          className="text-neutral-800 dark:text-neutral-200"
        >
          {mobileMenuOpen ? (
            <IconX className="w-6 h-6" />
          ) : (
            <IconMenu2 className="w-6 h-6" />
          )}
        </button>
      </header>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-16 bg-neutral-200/80 dark:bg-black/80 z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-16 md:top-0 left-0 h-[calc(100vh-4rem)] md:h-screen bg-neutral-200 dark:bg-black z-40
          w-[280px] md:w-[18%] md:max-w-[360px]
          transform transition-transform duration-300 ease-out
          ${
            mobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
          }
        `}
      >
        <div className="flex flex-col h-full p-4 md:py-8">
          <div className="mb-8 px-2 hidden md:flex flex-row justify-between items-center">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
              vmem
            </h1>
            <div className="flex flex-row justify-end items-center gap-2">
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                {mounted ? (
                  isDark ? (
                    <IconMoon className="w-4 h-4" />
                  ) : (
                    <IconSun className="w-4 h-4" />
                  )
                ) : (
                  "Theme"
                )}
              </span>
              {mounted && (
                <Switch
                  isSelected={isDark}
                  onValueChange={toggleTheme}
                  size="sm"
                  classNames={{
                    wrapper:
                      "bg-black/10 dark:bg-white/10 group-data-[selected=true]:bg-black dark:group-data-[selected=true]:bg-white",
                    thumb:
                      "bg-black dark:bg-white group-data-[selected=true]:bg-white dark:group-data-[selected=true]:bg-black",
                  }}
                />
              )}
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto scrollbar-thin">
            {navGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`
                          flex items-center gap-3 w-full px-4 py-3 rounded-xl text-base font-medium
                          transition-all duration-200 ease-out
                          ${
                            isActive
                              ? "bg-black text-white dark:bg-white dark:text-black"
                              : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                          }
                        `}
                      >
                        <Icon size={20} stroke={1.5} />
                        {item.label}
                      </Link>
                    );
                  })}
                </ul>
                {groupIndex < navGroups.length - 1 && (
                  <Divider className="my-4 bg-black/10 dark:bg-white/10" />
                )}
              </div>
            ))}
          </nav>
          <div className="pt-4 space-y-4">
            <p className="text-xs text-neutral-400 dark:text-neutral-600 px-4">
              © 2025 vmem
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
