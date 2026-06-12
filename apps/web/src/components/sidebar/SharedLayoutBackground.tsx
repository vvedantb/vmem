"use client";

import { cn } from "@vmem/ui";
import { motion } from "motion/react";
import { createContext, use, useId, useState, type ReactNode } from "react";

type SharedLayoutContextValue = {
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
  pinnedId: string | null;
  layoutGroupId: string;
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
  children: ReactNode;
  /** Resting highlight when the pointer is outside the group (e.g. active route). */
  pinnedId?: string | null;
  className?: string;
};

function Root({ children, pinnedId = null, className }: RootProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const layoutGroupId = useId();

  return (
    <SharedLayoutContext
      value={{
        hoverId,
        setHoverId,
        pinnedId,
        layoutGroupId,
      }}
    >
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
  className?: string;
  children: ReactNode;
};

function Item({ id, className, children }: ItemProps) {
  const { hoverId, setHoverId, pinnedId, layoutGroupId } =
    useSharedLayoutBackground();
  const backgroundId = hoverId ?? pinnedId;
  const isBackgroundTarget = backgroundId === id;

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={() => setHoverId(id)}
    >
      {isBackgroundTarget ? (
        <motion.div
          layoutId={layoutGroupId}
          transition={{
            type: "spring",
            stiffness: 205,
            damping: 22,
          }}
          className="pointer-events-none absolute inset-0 rounded-lg bg-surface-tertiary"
        />
      ) : null}
      <div className="relative z-10 min-w-0">{children}</div>
    </div>
  );
}

/** Shared hover/active pill that springs between sidebar rows (dimi.me/lab pattern). */
export const SharedLayoutBackground = {
  Root,
  Item,
};
