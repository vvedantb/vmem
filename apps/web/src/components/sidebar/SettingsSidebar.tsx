import type { MouseEventHandler } from "react";
import { motion } from "motion/react";
import { cn, motionDuration, motionEase } from "@vv/ui";
import { settingsNavGroups } from "./nav-config";
import { NavLink } from "./NavLink";
import { SharedLayoutBackground } from "./SharedLayoutBackground";

interface SettingsSidebarProps {
  pathname: string;
  isIconOnly: boolean;
  isMobile: boolean;
  onNavigate?: MouseEventHandler<HTMLAnchorElement>;
}

const settingsNavItems = settingsNavGroups.flatMap((group) => group.items);

/**
 * Second sidebar column for `/settings/*`.
 * Compact rows, shared-layout pill, one flat list of settings tabs.
 */
export function SettingsSidebar({
  pathname,
  isIconOnly,
  isMobile,
  onNavigate,
}: SettingsSidebarProps) {
  return (
    <motion.nav
      className={cn(
        "flex-1 space-y-1 overflow-y-auto scrollbar-thin",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      <SharedLayoutBackground.Root
        layoutId="settings-nav"
        className="space-y-1"
      >
        {settingsNavItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <SharedLayoutBackground.Item
              key={item.href}
              id={item.href}
              isActive={isActive}
            >
              <NavLink
                item={item}
                pathname={pathname}
                profileId={undefined}
                isIconOnly={isIconOnly}
                unreadCount={0}
                proposalsCount={0}
                onNavigate={onNavigate}
              />
            </SharedLayoutBackground.Item>
          );
        })}
      </SharedLayoutBackground.Root>
    </motion.nav>
  );
}
