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
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import Image from "next/image";

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

type SidebarProps = {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
};

export default function Sidebar({
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
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
      <header className="fixed top-0 left-0 right-0 h-16 bg-sidebar/95 backdrop-blur-sm border-b border-border/60 z-50 md:hidden flex items-center justify-between px-4">
        <Link
          href="/"
          onClick={() => setMobileMenuOpen(false)}
          className="flex flex-row items-center gap-1.5"
        >
          <div className="relative mt-1 flex h-[28px] w-[28px] items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
            <Image
              unoptimized
              width={18}
              height={18}
              alt="vmem icon"
              src="/icon-dark.svg"
              className="block dark:hidden"
            />
            <Image
              unoptimized
              width={18}
              height={18}
              src="/icon-light.svg"
              alt="vmem icon"
              className="hidden dark:block"
            />
            <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15" />
          </div>
          <h1 className="text-2xl font-instrumentSerif text-foreground">
            v<span className="italic">mem</span>
          </h1>
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          className="text-foreground rounded-xl border border-border/60 bg-muted/50 hover:bg-accent/70"
        >
          {mobileMenuOpen ? (
            <IconX className="w-6 h-6" />
          ) : (
            <IconMenu2 className="w-6 h-6" />
          )}
        </Button>
      </header>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-16 bg-black/30 backdrop-blur-[2px] z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-[4.5rem] md:top-0 left-2 md:left-0 right-2 md:right-auto h-[calc(100vh-5rem)] md:h-screen bg-sidebar/95 backdrop-blur-sm border border-border/60 md:border-r-0 md:border-t-0 md:border-b-0 md:border-l-0 rounded-2xl md:rounded-none shadow-xl md:shadow-none z-40
          w-[min(86vw,320px)] md:w-auto ${isCollapsed ? "md:w-[92px] md:max-w-[92px]" : "md:w-[clamp(260px,18vw,360px)] md:max-w-none"}
          transform transition-transform duration-300 ease-out
          ${
            mobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
          }
        `}
      >
        <div className="flex flex-col h-full p-3 md:p-4 md:py-8">
          <div className="px-3 pb-3 pt-1 md:hidden">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/90">
              Navigation
            </p>
          </div>
          <div
            className={`mb-6 hidden md:flex ${isCollapsed ? "flex-col items-center gap-3" : "px-2 flex-row justify-between items-center"}`}
          >
            <Link
              href="/"
              className={`flex flex-row items-center ${isCollapsed ? "" : "gap-1.5"}`}
            >
              <div className="relative mt-1 flex h-[28px] w-[28px] items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                <Image
                  unoptimized
                  width={18}
                  height={18}
                  alt="vmem icon"
                  src="/icon-dark.svg"
                  className="block dark:hidden"
                />
                <Image
                  unoptimized
                  width={18}
                  height={18}
                  src="/icon-light.svg"
                  alt="vmem icon"
                  className="hidden dark:block"
                />
                <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15" />
              </div>
              {!isCollapsed && (
                <h1 className="text-3xl font-instrumentSerif text-foreground">
                  v<span className="italic">mem</span>
                </h1>
              )}
            </Link>
            <div
              className={`flex items-center ${isCollapsed ? "flex-col gap-2" : "flex-row justify-end gap-2"}`}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onToggleCollapse}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="text-muted-foreground hover:text-foreground hover:bg-accent/70 rounded-lg"
              >
                {isCollapsed ? (
                  <IconChevronRight className="w-4 h-4" />
                ) : (
                  <IconChevronLeft className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto scrollbar-thin pr-1">
            {navGroups.map((group, groupIndex) => (
              <div key={groupIndex} className="px-1 md:px-1">
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
                        title={isCollapsed ? item.label : undefined}
                        className={`
                          group relative flex items-center w-full py-3 md:py-2.5 rounded-xl text-[15px] font-medium
                          transition-all duration-200 ease-out
                          ${isCollapsed ? "justify-center px-2" : "gap-3 px-4"}
                          ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/70"
                          }
                        `}
                      >
                        {isActive && !isCollapsed && (
                          <span className="absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary-foreground/90" />
                        )}
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            isActive
                              ? "bg-primary-foreground/15"
                              : "bg-muted/50 group-hover:bg-muted"
                          }`}
                        >
                          <Icon size={18} stroke={1.7} />
                        </span>
                        {!isCollapsed && (
                          <span className="flex-1">{item.label}</span>
                        )}
                        {showBadge && !isCollapsed && (
                          <span
                            className={`min-w-5 h-5 px-1.5 rounded-full text-xs font-medium flex items-center justify-center ${
                              isActive
                                ? "bg-primary-foreground text-primary"
                                : "bg-primary text-primary-foreground"
                            }`}
                          >
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                        {showBadge && isCollapsed && (
                          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
                        )}
                      </Link>
                    );
                  })}
                </ul>
                {groupIndex < navGroups.length - 1 && (
                  <Separator className="my-4 bg-border/70" />
                )}
              </div>
            ))}
          </nav>
          <Separator className="bg-border/70" />

          <div className="pt-4 space-y-4">
            {isAuthLoading ? (
              <div className={`${isCollapsed ? "px-2 py-3" : "px-4 py-3"}`}>
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  {!isCollapsed && (
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-24 rounded" />
                      <Skeleton className="h-2 w-32 rounded" />
                    </div>
                  )}
                </div>
              </div>
            ) : user ? (
              <div className="px-2">
                <div
                  className={`flex items-center p-2 rounded-2xl bg-muted/70 border border-border/60 shadow-sm ${
                    isCollapsed ? "justify-center" : "gap-3"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary ring-1 ring-primary/20 flex items-center justify-center text-primary-foreground font-medium text-sm">
                    {getUserInitials(user.fullName || user.firstName || "U")}
                  </div>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {user.fullName || user.firstName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.primaryEmailAddress?.emailAddress}
                      </p>
                    </div>
                  )}
                  {mounted && !isCollapsed && (
                    <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-1.5 py-1">
                      <span className="text-sm font-medium text-muted-foreground">
                        {isDark ? (
                          <IconMoon className="w-4 h-4" />
                        ) : (
                          <IconSun className="w-4 h-4" />
                        )}
                      </span>
                      <Switch
                        checked={isDark}
                        onCheckedChange={toggleTheme}
                        className="scale-75"
                      />
                    </div>
                  )}
                  {mounted && isCollapsed && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={toggleTheme}
                      aria-label="Toggle theme"
                      className="text-muted-foreground hover:text-foreground hover:bg-accent/70 rounded-lg"
                    >
                      {isDark ? (
                        <IconMoon className="w-4 h-4" />
                      ) : (
                        <IconSun className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => signOut()}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    aria-label="Logout"
                  >
                    <IconLogout size={18} />
                  </Button>
                </div>
              </div>
            ) : null}

            {/* <p className="text-xs text-muted-foreground px-4">
              &copy; 2025 vmem
            </p> */}
          </div>
        </div>
      </aside>
    </>
  );
}
