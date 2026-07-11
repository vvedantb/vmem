import { Link } from "@tanstack/react-router";
import type { MouseEventHandler } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import type { NavItem, NavIcon } from "./types";
import { navHrefToPath } from "./nav-config";
import { SidebarIconTooltip } from "./SidebarIconTooltip";
import { sidebarNavRowClass, sidebarNavLinkTextClass } from "./sidebar-nav-row";

/**
 * Sidebar nav link.
 *
 * Carries a single optional badge whose source depends on the route:
 * - `/inbox` → pending proposals + unread notifications (sum)
 *
 * Both counts come in as separate props so the parent doesn't have to
 * predict which the link cares about. Routes without a badge ignore them.
 */
export function NavLink({
  item,
  pathname,
  profileId,
  isIconOnly,
  unreadCount,
  proposalsCount,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  /** Active workspace id; workspace hrefs fall back to /home without one. */
  profileId: string | undefined;
  isIconOnly: boolean;
  unreadCount: number;
  proposalsCount: number;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const resolvedPath = navHrefToPath(item.href, profileId);
  const isActive =
    pathname === resolvedPath || pathname.startsWith(resolvedPath + "/");
  const Icon = item.icon as NavIcon;

  // Resolve the badge count for this route. Adding a new badge route =
  // new branch here + corresponding prop on this component.
  const badgeCount = item.href.endsWith("/inbox")
    ? proposalsCount + unreadCount
    : 0;
  const showBadge = badgeCount > 0;

  return (
    <SidebarIconTooltip label={item.label} enabled={isIconOnly}>
      <Link
        to={resolvedPath}
        onClick={onNavigate}
        className={cn(
          "group relative flex w-full items-center rounded-lg text-sm font-medium tracking-normal transition-[transform,color] duration-200 ease-smooth active:scale-[0.96]",
          sidebarNavRowClass(isIconOnly),
          sidebarNavLinkTextClass(isActive),
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
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-secondary px-1.5 text-xs font-medium text-muted"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                duration: motionDuration.fast,
                ease: motionEase,
              }}
            >
              {badgeCount > 99 ? "99+" : badgeCount}
            </motion.span>
          ) : null}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {showBadge && isIconOnly ? (
            <motion.span
              key={`${item.href}-dot`}
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent"
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
    </SidebarIconTooltip>
  );
}
