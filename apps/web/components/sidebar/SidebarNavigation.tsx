"use client";

import type { MouseEventHandler } from "react";
import { motion, type Variants } from "motion/react";
import {
  Separator,
  cn,
  motionTiming,
  staggerContainer,
  staggerItem,
} from "@vmem/ui";
import type { NavIcon } from "./types";
import { navGroups } from "./nav-config";
import { NavLink } from "./NavLink";

export type SidebarNavigationProps = {
  pathname: string;
  unreadCount: number;
  isCollapsed: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
};

export function SidebarNavigation({
  pathname,
  unreadCount,
  isCollapsed,
  isMobile,
  onNavigate,
}: SidebarNavigationProps) {
  const isIconOnly = !isMobile && isCollapsed;
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
              className="space-y-1"
              variants={staggerContainer(motionTiming.stagger)}
            >
              {group.items.map((item) => (
                <motion.li key={item.href} variants={staggerItem}>
                  <NavLink
                    item={item}
                    pathname={pathname}
                    isIconOnly={isIconOnly}
                    isMobile={isMobile}
                    unreadCount={unreadCount}
                    onNavigate={onNavigate}
                  />
                  {item.children && !isIconOnly ? (
                    <ul className="space-y-0.5 mt-0.5">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <NavLink
                            item={child}
                            pathname={pathname}
                            isIconOnly={isIconOnly}
                            isMobile={isMobile}
                            unreadCount={unreadCount}
                            onNavigate={onNavigate}
                            indent
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        );
      })}
    </motion.nav>
  );
}
