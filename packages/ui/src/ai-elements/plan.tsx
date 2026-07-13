"use client";

import type { ComponentProps } from "react";
import { IconCheck, IconLoader2 } from "@tabler/icons-react";
import { cn } from "../utils/cn";

type PlanProps = ComponentProps<"div">;

function Plan({ className, children, ...props }: PlanProps) {
  return (
    <div
      className={cn("rounded-lg bg-surface-secondary/40 p-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}

type PlanHeaderProps = ComponentProps<"div">;

function PlanHeader({ className, ...props }: PlanHeaderProps) {
  return (
    <div
      className={cn("mb-2 text-xs font-medium text-muted", className)}
      {...props}
    />
  );
}

type PlanListProps = ComponentProps<"ol">;

function PlanList({ className, ...props }: PlanListProps) {
  return <ol className={cn("space-y-1.5", className)} {...props} />;
}

type PlanItemStatus = "pending" | "in_progress" | "completed";

type PlanItemProps = ComponentProps<"li"> & {
  status?: PlanItemStatus;
};

function PlanItem({
  status = "pending",
  className,
  children,
  ...props
}: PlanItemProps) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-xs text-muted",
        status === "completed" && "text-foreground",
        className,
      )}
      {...props}
    >
      <span className="mt-0.5 inline-flex size-3.5 items-center justify-center">
        {status === "completed" && (
          <IconCheck className="size-3.5 text-success" stroke={1.5} />
        )}
        {status === "in_progress" && (
          <IconLoader2
            className="size-3.5 animate-spin text-accent"
            stroke={1.5}
          />
        )}
        {status === "pending" && (
          <span className="size-1.5 rounded-full bg-surface-tertiary/50" />
        )}
      </span>
      <span>{children}</span>
    </li>
  );
}

export {
  Plan,
  PlanHeader,
  PlanList,
  PlanItem,
  type PlanProps,
  type PlanHeaderProps,
  type PlanListProps,
  type PlanItemProps,
  type PlanItemStatus,
};
