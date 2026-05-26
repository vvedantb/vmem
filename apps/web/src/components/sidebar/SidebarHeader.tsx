import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Button, cn, motionDuration, motionEase } from "@vmem/ui";
import {
  IconArrowLeft,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpandFilled,
} from "@tabler/icons-react";
import { VmemDrawInIcon } from "../svg-animations";
import type { SidebarNavView } from "./SidebarNavigation";
import { getSubSidebarTitle } from "./sidebar-header-titles";

type SidebarHeaderProps = {
  navView: SidebarNavView;
  isCollapsed: boolean;
  isMobile: boolean;
  onBack: () => void;
  onToggleCollapse: () => void;
  mobileCloseButton?: ReactNode;
  onLogoNavigate?: () => void;
};

function BackButton({
  onClick,
  className,
  label = "Back to main navigation",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "rounded-lg text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
        className,
      )}
    >
      <IconArrowLeft className="h-4 w-4" />
    </Button>
  );
}

function CollapseButton({
  isCollapsed,
  onToggleCollapse,
  className,
}: {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onToggleCollapse}
      aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={cn(
        "rounded-lg text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
        className,
      )}
    >
      {isCollapsed ? (
        <IconLayoutSidebarLeftExpandFilled className="h-4 w-4" />
      ) : (
        <IconLayoutSidebarLeftCollapse className="h-4 w-4" />
      )}
    </Button>
  );
}

function SubSidebarTitle({ title }: { title: string }) {
  return (
    <h1 className="truncate text-center text-xl leading-none font-instrumentSerif text-foreground">
      {title}
    </h1>
  );
}

function MainLogoLink({
  isCollapsed,
  onNavigate,
}: {
  isCollapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to="/home"
      onClick={onNavigate}
      className={cn(
        "group flex flex-row items-center gap-2",
        isCollapsed ? "justify-center" : "col-start-2 justify-self-center",
      )}
    >
      <VmemDrawInIcon size={22} className="text-foreground" />
      <AnimatePresence initial={false}>
        {!isCollapsed ? (
          <motion.span
            key="sidebar-logo-text"
            className="text-xl leading-none font-instrumentSerif text-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: motionDuration.fast,
              ease: motionEase,
            }}
          >
            v<span className="italic">mem</span>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </Link>
  );
}

export function SidebarHeader({
  navView,
  isCollapsed,
  isMobile,
  onBack,
  onToggleCollapse,
  mobileCloseButton,
  onLogoNavigate,
}: SidebarHeaderProps) {
  const subTitle = getSubSidebarTitle(navView);
  const isSubView = subTitle !== null;

  if (isMobile) {
    if (isSubView) {
      return (
        <div className="mb-4 grid grid-cols-[auto_1fr_auto] items-center gap-2 py-2">
          <BackButton onClick={onBack} className="col-start-1" />
          <div className="col-start-2 min-w-0 px-1">
            <SubSidebarTitle title={subTitle} />
          </div>
          <div className="col-start-3 flex justify-end">
            {mobileCloseButton}
          </div>
        </div>
      );
    }

    return (
      <div className="relative mb-4 flex items-center py-2">
        {mobileCloseButton}
        <Link
          to="/home"
          onClick={onLogoNavigate}
          className="group absolute left-1/2 flex -translate-x-1/2 flex-row items-center gap-2"
        >
          <VmemDrawInIcon size={22} className="text-foreground" />
          <h1 className="text-xl leading-none font-instrumentSerif text-foreground">
            v<span className="italic">mem</span>
          </h1>
        </Link>
      </div>
    );
  }

  if (isCollapsed) {
    return (
      <div className="mb-6 flex flex-col items-center gap-3 px-2 pb-2">
        {isSubView ? (
          <BackButton onClick={onBack} />
        ) : (
          <MainLogoLink isCollapsed />
        )}
        <CollapseButton
          isCollapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
        />
      </div>
    );
  }

  if (isSubView) {
    return (
      <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 pb-2">
        <BackButton onClick={onBack} className="col-start-1" />
        <div className="col-start-2 min-w-0 px-1">
          <SubSidebarTitle title={subTitle} />
        </div>
        <CollapseButton
          isCollapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          className="col-start-3 justify-self-end"
        />
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center px-2 pb-2">
      <MainLogoLink isCollapsed={false} />
      <CollapseButton
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        className="col-start-3 justify-self-end"
      />
    </div>
  );
}
