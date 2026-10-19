import type { MouseEventHandler } from "react";
import { motion } from "motion/react";
import { cn, motionDuration, motionEase } from "@vvedantb/ui";
import { useDisablePageMotion } from "@/providers/PageMotionProvider";
import { settingsNavGroups } from "./nav-config";
import { NavLink } from "./NavLink";

interface SettingsSidebarProps {
  pathname: string;
  isIconOnly: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}

const settingsNavItems = settingsNavGroups.flatMap((group) => group.items);

/**
 * Second sidebar column for `/settings/*`.
 * Compact rows with the package static fill, one flat list of settings tabs.
 */
export function SettingsSidebar({
  pathname,
  isIconOnly,
  isMobile,
  onNavigate,
}: SettingsSidebarProps) {
  const skipEnter = useDisablePageMotion();
  return (
    <motion.nav
      className={cn(
        "flex-1 space-y-1 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={skipEnter ? false : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      {settingsNavItems.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          profileId={undefined}
          isIconOnly={isIconOnly}
          unreadCount={0}
          proposalsCount={0}
          onNavigate={onNavigate}
        />
      ))}
    </motion.nav>
  );
}
