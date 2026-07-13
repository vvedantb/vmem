"use client";

import { cn } from "@vmem/ui";
import { motion } from "motion/react";
import { createContext, use, useState, type ReactNode } from "react";
import { sidebarSharedLayoutTransition } from "./sidebar-nav-row";

type SharedLayoutContextValue = {
  layoutId: string;
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
};

const SharedLayoutContext = createContext<SharedLayoutContextValue | null>(
  null,
);

function useSharedLayoutBackground(): SharedLayoutContextValue {
  const ctx = use(SharedLayoutContext);
  if (ctx === null) {
    throw new Error(
      "SharedLayoutBackground.Item must be used within SharedLayoutBackground.Root",
    );
  }
  return ctx;
}

type RootProps = {
  layoutId: string;
  children: ReactNode;
  className?: string;
};

function Root({ layoutId, children, className }: RootProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  return (
    <SharedLayoutContext value={{ layoutId, hoverId, setHoverId }}>
      <div
        className={cn("flex w-full flex-col", className)}
        onMouseLeave={() => setHoverId(null)}
      >
        {children}
      </div>
    </SharedLayoutContext>
  );
}

type ItemProps = {
  id: string;
  isActive: boolean;
  className?: string;
  children: ReactNode;
};

function Item({ id, isActive, className, children }: ItemProps) {
  const { layoutId, hoverId, setHoverId } = useSharedLayoutBackground();
  const highlighted = hoverId !== null ? hoverId === id : isActive;

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => setHoverId(id)}
    >
      {highlighted ? (
        <motion.div
          layoutId={layoutId}
          transition={sidebarSharedLayoutTransition}
          className="pointer-events-none absolute inset-0 rounded-lg bg-surface-tertiary"
        />
      ) : null}
      <div className="relative z-10 min-w-0">{children}</div>
    </div>
  );
}

/** Shared hover/active pill that springs between sidebar rows (Eva SharedLayoutNav). */
export const SharedLayoutBackground = {
  Root,
  Item,
};
