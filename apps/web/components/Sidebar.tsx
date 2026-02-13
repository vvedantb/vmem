"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Switch, Separator, Button, Skeleton } from "@vmem/ui";
import { useThemeContext } from "./contexts/ThemeContext";
import { useUser, useClerk } from "@clerk/nextjs";
import { useNotifications } from "./contexts/NotificationContext";
import {
  IconMessageCircle,
  IconBrain,
  IconKey,
  IconBell,
  IconUser,
  IconSettings,
  IconMenu2,
  IconX,
  IconFiles,
  IconPlugConnected,
  IconMoon,
  IconSun,
  IconLogout,
} from "@tabler/icons-react";

const navGroups = [
  {
    items: [
      { href: "/chat", label: "Chat", icon: IconMessageCircle },
      { href: "/memories/list", label: "Memories", icon: IconBrain },
      { href: "/files", label: "Files", icon: IconFiles },
    ],
  },
  {
    items: [
      { href: "/api/logs", label: "API", icon: IconKey },
      { href: "/connectors", label: "Connectors", icon: IconPlugConnected },
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
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const isAuthLoading = !isLoaded;
  const { unreadCount } = useNotifications();

  const isDark = theme === "dark";

  const getUserInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 bg-neutral-200 dark:bg-black z-50 md:hidden flex items-center justify-between px-6">
        <Link href="/" onClick={() => setMobileMenuOpen(false)}>
          <h1 className="text-xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
            vmem
          </h1>
        </Link>
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
          className="fixed inset-0 top-16 bg-black/20 z-30 md:hidden"
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
            <Link href="/">
              <h1 className="text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-200">
                vmem
              </h1>
            </Link>
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
                  checked={isDark}
                  onCheckedChange={toggleTheme}
                  className="scale-75"
                />
              )}
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto scrollbar-thin">
            {navGroups.map((group, groupIndex) => (
              <div key={groupIndex}>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    const isNotifications = item.href === "/notifications";
                    const showBadge = isNotifications && unreadCount > 0;
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
                        <span className="flex-1">{item.label}</span>
                        {showBadge && (
                          <span
                            className={`min-w-5 h-5 px-1.5 rounded-full text-xs font-medium flex items-center justify-center ${
                              isActive
                                ? "bg-white text-black dark:bg-black dark:text-white"
                                : "bg-black text-white dark:bg-white dark:text-black"
                            }`}
                          >
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </ul>
                {groupIndex < navGroups.length - 1 && (
                  <Separator className="my-4 bg-black/10 dark:bg-white/10" />
                )}
              </div>
            ))}
          </nav>
          <div className="pt-4 space-y-4">
            {isAuthLoading ? (
              <div className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-24 rounded" />
                    <Skeleton className="h-2 w-32 rounded" />
                  </div>
                </div>
              </div>
            ) : user ? (
              <div className="px-2">
                <div className="flex items-center gap-3 p-2 rounded-xl bg-black/5 dark:bg-white/5">
                  <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center text-white dark:text-black font-medium text-sm">
                    {getUserInitials(user.fullName || user.firstName || "U")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black dark:text-white truncate">
                      {user.fullName || user.firstName}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      {user.primaryEmailAddress?.emailAddress}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => signOut()}
                    className="text-neutral-500 hover:text-red-500 dark:text-neutral-400 dark:hover:text-red-400"
                    aria-label="Logout"
                  >
                    <IconLogout size={18} />
                  </Button>
                </div>
              </div>
            ) : null}

            <Separator className="bg-black/10 dark:bg-white/10" />

            <p className="text-xs text-neutral-400 dark:text-neutral-600 px-4">
              &copy; 2025 vmem
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
