"use client";

import type { MouseEventHandler } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  Separator,
  cn,
  motionDuration,
  motionEase,
  motionTiming,
  staggerContainer,
  staggerItem,
} from "@vmem/ui";
import { IconArrowLeft, IconSettings } from "@tabler/icons-react";
import type { NavIcon } from "./types";
import { navGroups, settingsNavItems } from "./nav-config";
import { NavLink } from "./NavLink";

export type SidebarNavigationProps = {
  pathname: string;
  unreadCount: number;
  isCollapsed: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

function MainNav({
  pathname,
  unreadCount,
  isIconOnly,
  isMobile,
  onNavigate,
  onSettingsClick,
}: {
  pathname: string;
  unreadCount: number;
  isIconOnly: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
  onSettingsClick: () => void;
}) {
  const navVariants: Variants = {
    hidden: {},
    show: {
      transition: {
        when: "beforeChildren",
        delayChildren: 0.01,
        staggerChildren: motionTiming.stagger,
      },
    },
  };

  return (
    <motion.nav
      className={cn(
        "flex-1 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
      variants={navVariants}
      initial="hidden"
      animate="show"
    >
      {navGroups.map((group) => {
        const GroupIcon = group.icon as NavIcon;
        return (
          <motion.div key={group.title} className="px-1 mb-4">
            {!isIconOnly ? (
              <div className="flex items-center gap-2 px-3.5 mb-2">
                <GroupIcon
                  size={14}
                  stroke={1.8}
                  className="shrink-0 text-muted-foreground/70"
                />
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  {group.title}
                </span>
                <Separator className="flex-1 bg-border/40" />
              </div>
            ) : (
              <div className="flex justify-center mb-2">
                <Separator className="w-6 bg-border/40" />
              </div>
            )}
            <motion.ul
              className={cn("space-y-1", !isIconOnly && "pl-1.5")}
              variants={staggerContainer(motionTiming.stagger)}
            >
              {group.items.map((item) => {
                if (item.href === "/settings") {
                  const isActive = pathname.startsWith("/settings");
                  const Icon = item.icon as NavIcon;
                  return (
                    <motion.li key={item.href} variants={staggerItem}>
                      <button
                        type="button"
                        onClick={onSettingsClick}
                        title={isIconOnly ? item.label : undefined}
                        className={cn(
                          "group relative flex w-full items-center rounded-xl text-sm font-medium tracking-normal transition-all duration-200 ease-smooth",
                          isIconOnly
                            ? "justify-center px-2 py-2.5"
                            : "gap-3 px-3.5",
                          isMobile ? "py-3.5" : "py-2.5",
                          isActive
                            ? "glass-interactive text-foreground"
                            : "text-muted-foreground hover:bg-card/45 hover:text-foreground",
                        )}
                      >
                        <span className="flex h-5 w-5 items-center justify-center text-current">
                          <Icon size={18} stroke={1.7} />
                        </span>
                        <AnimatePresence initial={false}>
                          {!isIconOnly ? (
                            <motion.span
                              key="settings-label"
                              className="flex-1 text-left"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{
                                duration: motionDuration.fast,
                                ease: motionEase,
                              }}
                            >
                              {item.label}
                            </motion.span>
                          ) : null}
                        </AnimatePresence>
                      </button>
                    </motion.li>
                  );
                }
                return (
                  <motion.li key={item.href} variants={staggerItem}>
                    <NavLink
                      item={item}
                      pathname={pathname}
                      isIconOnly={isIconOnly}
                      isMobile={isMobile}
                      unreadCount={unreadCount}
                      onNavigate={onNavigate}
                    />
                  </motion.li>
                );
              })}
            </motion.ul>
          </motion.div>
        );
      })}
    </motion.nav>
  );
}

function SettingsNav({
  pathname,
  isIconOnly,
  isMobile,
  onBack,
  onNavigate,
}: {
  pathname: string;
  isIconOnly: boolean;
  isMobile: boolean;
  onBack: () => void;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <motion.nav
      className={cn(
        "flex-1 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <div className="px-1 mb-4">
        <ul className="space-y-1">
          <li>
            <button
              type="button"
              onClick={onBack}
              title={isIconOnly ? "Back" : undefined}
              className={cn(
                "group relative flex w-full items-center rounded-xl text-sm font-medium tracking-normal transition-all duration-200 ease-smooth text-muted-foreground hover:bg-card/45 hover:text-foreground",
                isIconOnly ? "justify-center px-2 py-2.5" : "gap-3 px-3.5",
                isMobile ? "py-3.5" : "py-2.5",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center text-current">
                <IconArrowLeft size={18} stroke={1.7} />
              </span>
              <AnimatePresence initial={false}>
                {!isIconOnly ? (
                  <motion.span
                    key="back-label"
                    className="flex-1 text-left"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: motionDuration.fast,
                      ease: motionEase,
                    }}
                  >
                    Back
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
          </li>
          {settingsNavItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon as NavIcon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  title={isIconOnly ? item.label : undefined}
                  className={cn(
                    "group relative flex w-full items-center rounded-xl text-sm font-medium tracking-normal transition-all duration-200 ease-smooth",
                    isIconOnly ? "justify-center px-2 py-2.5" : "gap-3 px-3.5",
                    isMobile ? "py-3.5" : "py-2.5",
                    isActive
                      ? "glass-interactive text-foreground"
                      : "text-muted-foreground hover:bg-card/45 hover:text-foreground",
                  )}
                >
                  <span className="flex h-5 w-5 items-center justify-center text-current">
                    <Icon size={18} stroke={1.7} />
                  </span>
                  <AnimatePresence initial={false}>
                    {!isIconOnly ? (
                      <motion.span
                        key={`${item.href}-label`}
                        className="flex-1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          duration: motionDuration.fast,
                          ease: motionEase,
                        }}
                      >
                        {item.label}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </motion.nav>
  );
}

export function SidebarNavigation({
  pathname,
  unreadCount,
  isCollapsed,
  isMobile,
  onNavigate,
}: SidebarNavigationProps) {
  const isIconOnly = !isMobile && isCollapsed;
  const isSettingsRoute = pathname.startsWith("/settings");
  const router = useRouter();

  const handleSettingsClick = () => {
    router.push("/settings/preferences");
  };

  const handleBack = () => {
    router.push("/chat");
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isSettingsRoute ? (
        <SettingsNav
          key="settings"
          pathname={pathname}
          isIconOnly={isIconOnly}
          isMobile={isMobile}
          onBack={handleBack}
          onNavigate={onNavigate}
        />
      ) : (
        <MainNav
          key="main"
          pathname={pathname}
          unreadCount={unreadCount}
          isIconOnly={isIconOnly}
          isMobile={isMobile}
          onNavigate={onNavigate}
          onSettingsClick={handleSettingsClick}
        />
      )}
    </AnimatePresence>
  );
}
