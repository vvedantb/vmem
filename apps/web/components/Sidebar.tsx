"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useState,
  type ComponentType,
  type MouseEventHandler,
} from "react";
import {
  Separator,
  Button,
  Skeleton,
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogRawContent,
  DialogClose,
  DialogTitle,
  cn,
} from "@vmem/ui";
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
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpandFilled,
} from "@tabler/icons-react";

const navGroups = [
  {
    title: "Workspace",
    items: [
      { href: "/chat", label: "Chat", icon: IconMessageCircle },
      { href: "/memories/list", label: "Memories", icon: IconBrain },
      { href: "/files", label: "Files", icon: IconFiles },
    ],
  },
  {
    title: "Integrations",
    items: [
      { href: "/api/logs", label: "API", icon: IconKey },
      { href: "/connectors", label: "Connectors", icon: IconPlugConnected },
    ],
  },
  {
    title: "Account",
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

type SidebarNavigationProps = {
  pathname: string;
  unreadCount: number;
  isCollapsed: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

type SidebarFooterProps = {
  isCollapsed: boolean;
  isMobile: boolean;
  mounted: boolean;
  isDark: boolean;
  toggleTheme: () => void;
  isAuthLoading: boolean;
};

type NavIcon = ComponentType<{
  className?: string;
  size?: number;
  stroke?: number;
}>;

function SidebarNavigation({
  pathname,
  unreadCount,
  isCollapsed,
  isMobile,
  onNavigate,
}: SidebarNavigationProps) {
  const isIconOnly = !isMobile && isCollapsed;

  return (
    <nav
      className={cn(
        "flex-1 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
    >
      {navGroups.map((group, groupIndex) => (
        <div key={group.title} className="px-1">
          <ul className="space-y-1.5">
            {group.items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon as NavIcon;
              const isNotifications = item.href === "/notifications";
              const showBadge = isNotifications && unreadCount > 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={isIconOnly ? item.label : undefined}
                  className={cn(
                    "group relative flex w-full items-center rounded-xl text-sm font-medium tracking-normal transition-all duration-200 ease-smooth",
                    isIconOnly ? "justify-center px-2 py-2.5" : "gap-3 px-3.5",
                    isMobile ? "py-3.5" : "py-2.5",
                    isActive
                      ? "bg-card/75 text-foreground shadow-insetSoft"
                      : "text-muted-foreground hover:bg-card/45 hover:text-foreground",
                  )}
                >
                  <span className="flex h-5 w-5 items-center justify-center text-current">
                    <Icon size={18} stroke={1.7} />
                  </span>
                  {!isIconOnly && <span className="flex-1">{item.label}</span>}
                  {showBadge && !isIconOnly && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                  {showBadge && isIconOnly && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
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
  );
}

function SidebarFooter({
  isCollapsed,
  isMobile,
  mounted,
  isDark,
  toggleTheme,
  isAuthLoading,
}: SidebarFooterProps) {
  const isIconOnly = !isMobile && isCollapsed;

  return (
    <div className={cn("space-y-4 pt-3", isMobile && "pb-3")}>
      <Separator className="bg-border/45" />

      <div className={cn(isMobile ? "px-1" : "px-2")}>
        {isAuthLoading ? (
          <div
            className={cn(
              isIconOnly
                ? "flex flex-col items-center gap-2 py-1"
                : "flex items-center justify-between",
            )}
          >
            <Skeleton className="h-10 w-10 rounded-full" />
            {mounted && <Skeleton className="h-8 w-8 rounded-lg" />}
          </div>
        ) : (
          <div
            className={cn(
              isIconOnly
                ? "flex flex-col items-center gap-2"
                : "flex items-center justify-between gap-2",
            )}
          >
            <UserButton
              showName={!isIconOnly}
              appearance={{
                elements: {
                  userButtonBox: isIconOnly
                    ? "flex justify-center"
                    : "flex w-full",
                  userButtonTrigger: `rounded-xl bg-transparent transition-colors hover:bg-card/60 focus:shadow-none ${
                    isIconOnly
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
            {mounted && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={toggleTheme}
                title={
                  isDark ? "Switch to light theme" : "Switch to dark theme"
                }
                aria-label={
                  isDark ? "Switch to light theme" : "Switch to dark theme"
                }
                className="shrink-0 rounded-lg text-muted-foreground hover:bg-card/60 hover:text-foreground"
              >
                {isDark ? (
                  <IconMoon className="h-4 w-4" />
                ) : (
                  <IconSun className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sidebar({
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuId = useId();
  const { theme, toggleTheme, mounted } = useThemeContext();
  const { isLoaded } = useUser();
  const isAuthLoading = !isLoaded;
  const { unreadCount } = useNotifications();

  const isDark = theme === "dark";

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileMenuOpen(false);
      }
    };

    mediaQuery.addEventListener("change", closeOnDesktop);
    return () => mediaQuery.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <>
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border/70 bg-sidebar px-4 shadow-sm md:hidden">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex flex-row items-center gap-1.5"
          >
            <div className="relative mt-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
              <Image
                unoptimized
                width={22}
                height={22}
                alt="vmem icon"
                src="/icon-dark.svg"
                className="block dark:hidden"
              />
              <Image
                unoptimized
                width={22}
                height={22}
                src="/icon-light.svg"
                alt="vmem icon"
                className="hidden dark:block"
              />
              <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15" />
            </div>
            <h1 className="text-xl leading-none font-instrumentSerif text-foreground">
              v<span className="italic">mem</span>
            </h1>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls={mobileMenuId}
            className="rounded-full text-foreground hover:bg-card/70"
          >
            <IconMenu2 className="h-6 w-6" />
          </Button>
        </header>

        <DialogPortal>
          <DialogOverlay className="bg-black/50 md:hidden" />
          <DialogRawContent
            id={mobileMenuId}
            aria-label="Navigation menu"
            className="fixed inset-y-3 left-3 right-3 z-50 flex w-auto max-w-sm flex-col overflow-hidden rounded-3xl border border-border/70 bg-sidebar text-foreground shadow-panel outline-none md:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
          >
            <DialogTitle className="sr-only">Navigation menu</DialogTitle>

            <div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
              <div className="mb-4 flex items-center justify-between px-1">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-row items-center gap-1.5"
                >
                  <div className="relative mt-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                    <Image
                      unoptimized
                      width={22}
                      height={22}
                      alt="vmem icon"
                      src="/icon-dark.svg"
                      className="block dark:hidden"
                    />
                    <Image
                      unoptimized
                      width={22}
                      height={22}
                      src="/icon-light.svg"
                      alt="vmem icon"
                      className="hidden dark:block"
                    />
                    <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15" />
                  </div>
                  <h1 className="text-xl leading-none font-instrumentSerif text-foreground">
                    v<span className="italic">mem</span>
                  </h1>
                </Link>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close navigation menu"
                    className="rounded-full text-muted-foreground hover:bg-card/70 hover:text-foreground"
                  >
                    <IconX className="h-5 w-5" />
                  </Button>
                </DialogClose>
              </div>
              <SidebarNavigation
                pathname={pathname}
                unreadCount={unreadCount}
                isCollapsed={false}
                isMobile
                onNavigate={() => setMobileMenuOpen(false)}
              />
              <SidebarFooter
                isCollapsed={false}
                isMobile
                mounted={mounted}
                isDark={isDark}
                toggleTheme={toggleTheme}
                isAuthLoading={isAuthLoading}
              />
            </div>
          </DialogRawContent>
        </DialogPortal>
      </Dialog>

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 hidden h-screen bg-sidebar md:block",
          isCollapsed ? "w-24" : "w-80",
        )}
      >
        <div className="flex h-full flex-col p-4 pt-6">
          <div
            className={cn(
              "mb-6 flex",
              isCollapsed
                ? "flex-col items-center gap-3"
                : "flex-row items-center justify-between px-2",
            )}
          >
            <Link
              href="/"
              className={cn(
                "flex flex-row items-center",
                !isCollapsed && "gap-1.5",
              )}
            >
              <div className="relative mt-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                <Image
                  unoptimized
                  width={22}
                  height={22}
                  alt="vmem icon"
                  src="/icon-dark.svg"
                  className="block dark:hidden"
                />
                <Image
                  unoptimized
                  width={22}
                  height={22}
                  src="/icon-light.svg"
                  alt="vmem icon"
                  className="hidden dark:block"
                />
                <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15" />
              </div>
              {!isCollapsed && (
                <h1 className="text-xl font-instrumentSerif text-foreground">
                  v<span className="italic">mem</span>
                </h1>
              )}
            </Link>
            <div
              className={cn(
                "flex items-center",
                isCollapsed ? "flex-col gap-2" : "flex-row justify-end gap-2",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onToggleCollapse}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="rounded-lg text-muted-foreground hover:bg-accent/70 hover:text-foreground"
              >
                {isCollapsed ? (
                  <IconLayoutSidebarLeftExpandFilled className="h-4 w-4" />
                ) : (
                  <IconLayoutSidebarLeftCollapse className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <SidebarNavigation
            pathname={pathname}
            unreadCount={unreadCount}
            isCollapsed={isCollapsed}
            isMobile={false}
          />

          <SidebarFooter
            isCollapsed={isCollapsed}
            isMobile={false}
            mounted={mounted}
            isDark={isDark}
            toggleTheme={toggleTheme}
            isAuthLoading={isAuthLoading}
          />
        </div>
      </aside>
    </>
  );
}
