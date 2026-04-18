import { Link } from "@tanstack/react-router";
import type { MouseEventHandler } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import type { NavItem, NavIcon } from "./types";

export function NavLink({
  item,
  pathname,
  isIconOnly,
  isMobile,
  unreadCount,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  isIconOnly: boolean;
  isMobile: boolean;
  unreadCount: number;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const isActive =
    pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon as NavIcon;
  const isNotifications = item.href === "/notifications";
  const showBadge = isNotifications && unreadCount > 0;

  return (
    <Link
      to={item.href}
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
      <AnimatePresence initial={false}>
        {showBadge && !isIconOnly ? (
          <motion.span
            key={`${item.href}-badge`}
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{
              duration: motionDuration.fast,
              ease: motionEase,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </motion.span>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {showBadge && isIconOnly ? (
          <motion.span
            key={`${item.href}-dot`}
            className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{
              duration: motionDuration.fast,
              ease: motionEase,
            }}
          />
        ) : null}
      </AnimatePresence>
    </Link>
  );
}
