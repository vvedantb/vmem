"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Button,
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogRawContent,
  DialogClose,
  DialogTitle,
  cn,
  motionDistance,
  motionDuration,
  motionEase,
  motionTiming,
} from "@vmem/ui";
import { useThemeContext } from "./contexts/ThemeContext";
import { useUser } from "@clerk/nextjs";
import { useNotifications } from "./contexts/NotificationContext";
import {
  IconMenu2,
  IconX,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpandFilled,
  IconLayoutDashboard,
  IconHome,
} from "@tabler/icons-react";
import { SidebarNavigation } from "./sidebar/SidebarNavigation";
import { SidebarFooter } from "./sidebar/SidebarFooter";

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
        <header className="fixed inset-x-3 top-3 z-40 flex h-12 items-center justify-between glass-panel-subtle rounded-2xl px-3 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls={mobileMenuId}
            className="h-9 w-9 rounded-xl text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconMenu2 className="h-5 w-5" />
          </Button>
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-row items-center gap-2"
          >
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
            <h1 className="text-xl leading-none font-instrumentSerif text-foreground">
              v<span className="italic">mem</span>
            </h1>
          </Link>
          <div className="w-9" />
        </header>

        <DialogPortal>
          <DialogOverlay className="bg-black/50 md:hidden" />
          <DialogRawContent
            id={mobileMenuId}
            aria-label="Navigation menu"
            className="glass-panel-strong fixed inset-y-3 left-3 right-3 z-50 flex w-auto max-w-sm flex-col overflow-hidden rounded-3xl text-foreground outline-none md:hidden"
          >
            <DialogTitle className="sr-only">Navigation menu</DialogTitle>

            <motion.div
              className="flex min-h-0 flex-1 flex-col p-4"
              initial={{ opacity: 0, x: -motionDistance.routeX }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: motionTiming.sidebar, ease: motionEase }}
            >
              <div className="mb-4 flex items-center justify-between pl-4 pr-2 py-2">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-row items-center gap-2"
                >
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
                    className="glass-interactive rounded-full text-muted-foreground hover:text-foreground"
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
            </motion.div>
          </DialogRawContent>
        </DialogPortal>
      </Dialog>

      <motion.aside
        className="fixed left-0 top-0 z-40 hidden h-screen overflow-hidden bg-sidebar md:block"
        animate={{ width: isCollapsed ? 96 : 320 }}
        transition={{ duration: motionTiming.sidebar, ease: motionEase }}
      >
        <div className="flex h-full flex-col p-4 pt-7">
          <div
            className={cn(
              "mb-6 flex",
              isCollapsed
                ? "flex-col items-center gap-3"
                : "flex-row items-center justify-between px-2 pb-4 pl-4",
            )}
          >
            <Link
              href="/"
              className={cn(
                "flex flex-row items-center",
                !isCollapsed && "gap-2",
              )}
            >
              <Image
                unoptimized
                width={22}
                height={22}
                alt="vmem icon"
                src="/icon-dark.svg"
                className="mt-1 block dark:hidden"
              />
              <Image
                unoptimized
                width={22}
                height={22}
                src="/icon-light.svg"
                alt="vmem icon"
                className="mt-1 hidden dark:block"
              />
              <AnimatePresence initial={false}>
                {!isCollapsed ? (
                  <motion.h1
                    key="desktop-logo"
                    className="mt-0.5 text-xl font-instrumentSerif text-foreground"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: motionDuration.fast,
                      ease: motionEase,
                    }}
                  >
                    v<span className="italic">mem</span>
                  </motion.h1>
                ) : null}
              </AnimatePresence>
            </Link>
            <div
              className={cn(
                "flex items-center",
                isCollapsed ? "flex-col gap-2" : "flex-row justify-end gap-2",
              )}
            >
              <Link
                href="/home"
                aria-label="Home"
                className={cn(
                  "inline-flex items-center justify-center rounded-lg transition-all duration-200 ease-smooth h-7 w-7",
                  pathname.startsWith("/home")
                    ? "glass-interactive text-foreground"
                    : "glass-interactive text-muted-foreground hover:text-foreground",
                )}
              >
                <IconHome className="h-4 w-4" />
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onToggleCollapse}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="glass-interactive rounded-lg text-muted-foreground hover:text-foreground"
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
      </motion.aside>
    </>
  );
}
