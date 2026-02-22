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
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-border/70 bg-sidebar px-4 shadow-[0_1px_0_rgba(255,255,255,0.55)] md:hidden">
        <Link
          href="/"
          onClick={() => setMobileMenuOpen(false)}
          className="flex flex-row items-center gap-1.5"
        >
          <div className="relative mt-1 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
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
          <h1 className="text-[2rem] leading-none font-instrumentSerif text-foreground">
            v<span className="italic">mem</span>
          </h1>
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
          className="rounded-full text-foreground hover:bg-card/70"
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
          className="fixed inset-0 top-16 z-30 bg-foreground/15 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`
          fixed left-2 right-2 top-[4.5rem] z-40 h-[calc(100vh-5rem)] rounded-[1.65rem] bg-sidebar shadow-panel
          md:left-0 md:right-auto md:top-0 md:h-screen md:rounded-none md:bg-sidebar md:shadow-none
          w-[90vw] max-w-sm md:w-auto ${isCollapsed ? "md:w-24" : "md:w-80"}
          transform transition-all duration-300 ease-smooth
          ${
            mobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-[110%] md:translate-x-0"
          }
        `}
      >
        <div className="flex h-full flex-col p-3 md:p-4 md:py-5">
          <div className="px-3 pb-3 pt-1 md:hidden">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/90">
              Navigation
            </p>
          </div>
          <div
            className={`mb-6 hidden md:flex ${isCollapsed ? "flex-col items-center gap-3" : "flex-row items-center justify-between px-2"}`}
          >
            <Link
              href="/"
              className={`flex flex-row items-center ${isCollapsed ? "" : "gap-1.5"}`}
            >
              <div className="relative mt-1 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
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

          <nav className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
            {navGroups.map((group, groupIndex) => (
              <div key={groupIndex} className="px-1 md:px-1">
                <ul className="space-y-1.5">
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
                          group relative flex w-full items-center rounded-xl py-3 text-[15px] font-medium tracking-[-0.01em]
                          transition-all duration-200 ease-smooth md:py-2.5
                          ${isCollapsed ? "justify-center px-2" : "gap-3 px-3.5"}
                          ${
                            isActive
                              ? "bg-card/65 text-foreground"
                              : "text-muted-foreground hover:bg-card/45 hover:text-foreground"
                          }
                        `}
                      >
                        <span className="flex h-5 w-5 items-center justify-center text-current">
                          <Icon size={18} stroke={1.7} />
                        </span>
                        {!isCollapsed && (
                          <span className="flex-1">{item.label}</span>
                        )}
                        {showBadge && !isCollapsed && (
                          <span
                            className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium ${
                              isActive
                                ? "bg-primary text-primary-foreground"
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
                  <Separator className="my-4 bg-border/45" />
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
                className={`w-full rounded-xl text-muted-foreground hover:bg-card/60 hover:text-foreground ${
                  isCollapsed
                    ? "h-9 justify-center px-0"
                    : "h-10 justify-start gap-2.5 px-3"
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

          <Separator className="bg-border/45" />

          <div className="pt-4 space-y-4">
            {isAuthLoading ? (
              <div
                className={`${isCollapsed ? "flex justify-center px-2 py-3" : "px-4 py-3"}`}
              >
                <Skeleton className="h-10 w-10 rounded-full" />
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
                      userButtonTrigger: `rounded-xl bg-transparent transition-colors hover:bg-card/60 focus:shadow-none ${
                        isCollapsed
                          ? "h-10 w-10 p-0"
                          : "h-11 w-full justify-start gap-2.5 px-2.5"
                      }`,
                      userButtonAvatarBox: "h-8 w-8",
                      userButtonOuterIdentifier:
                        "truncate text-sm font-medium text-foreground",
                      userButtonPopoverCard:
                        "border border-border/70 bg-popover text-popover-foreground shadow-panel",
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
