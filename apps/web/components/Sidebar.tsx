"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Separator, Button, Skeleton } from "@vmem/ui";
import { useThemeContext } from "./contexts/ThemeContext";
import { UserButton, useUser } from "@clerk/nextjs";
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
  const { isLoaded } = useUser();
  const isAuthLoading = !isLoaded;
  const { unreadCount } = useNotifications();

  const isDark = theme === "dark";

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
          w-[min(86vw,320px)] md:w-auto ${isCollapsed ? "md:w-[92px] md:max-w-[92px]" : "md:w-[280px] md:max-w-[280px]"}
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

          {mounted && (
            <div className="px-2 pt-3 pb-2">
              <Button
                type="button"
                variant="ghost"
                onClick={toggleTheme}
                title={
                  isCollapsed
                    ? isDark
                      ? "Switch to light theme"
                      : "Switch to dark theme"
                    : undefined
                }
                aria-label={
                  isDark ? "Switch to light theme" : "Switch to dark theme"
                }
                className={`w-full rounded-xl border border-border/60 bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-accent/70 ${
                  isCollapsed
                    ? "h-9 justify-center px-0"
                    : "h-10 justify-start gap-2 px-3"
                }`}
              >
                {isDark ? (
                  <IconMoon className="w-4 h-4" />
                ) : (
                  <IconSun className="w-4 h-4" />
                )}
                {!isCollapsed && (
                  <span className="text-sm font-medium">
                    {isDark ? "Dark mode" : "Light mode"}
                  </span>
                )}
              </Button>
            </div>
          )}

          <Separator className="bg-border/70" />

          <div className="pt-4 space-y-4">
            {isAuthLoading ? (
              <div
                className={`${isCollapsed ? "px-2 py-3 flex justify-center" : "px-4 py-3"}`}
              >
                <Skeleton className="h-9 w-9 rounded-full" />
              </div>
            ) : (
              <div className="px-2">
                <UserButton
                  showName={!isCollapsed}
                  appearance={{
                    elements: {
                      userButtonBox: isCollapsed
                        ? "flex justify-center"
                        : "flex w-full",
                      userButtonTrigger: `rounded-xl border border-border/60 bg-muted/70 shadow-sm transition-colors hover:bg-accent/70 focus:shadow-none ${
                        isCollapsed
                          ? "h-10 w-10 p-0"
                          : "h-10 w-full justify-start gap-2 px-2"
                      }`,
                      userButtonAvatarBox: "h-8 w-8",
                      userButtonOuterIdentifier:
                        "text-sm font-medium text-foreground truncate",
                      userButtonPopoverCard:
                        "border border-border/70 bg-popover text-popover-foreground shadow-xl",
                      userButtonPopoverActionButton:
                        "rounded-lg hover:bg-accent hover:text-accent-foreground",
                    },
                  }}
                />
              </div>
            )}

            {/* <p className="text-xs text-muted-foreground px-4">
              &copy; 2025 vmem
            </p> */}
          </div>
        </div>
      </aside>
    </>
  );
}
