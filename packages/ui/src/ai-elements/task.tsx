"use client";

import type { ComponentProps } from "react";
import {
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconClock,
} from "@tabler/icons-react";
import { cn } from "../utils/cn";

type TaskStatus = "pending" | "running" | "completed" | "failed";

type TaskProps = ComponentProps<"div"> & {
  status?: TaskStatus;
};

function Task({
  status = "pending",
  className,
  children,
  ...props
}: TaskProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md bg-surface-secondary/40 px-2.5 py-2 text-xs",
        className,
      )}
      {...props}
    >
      <TaskStatusIcon status={status} />
      <span
        className={cn(
          "text-muted",
          status === "completed" && "text-foreground",
          status === "failed" && "text-danger",
        )}
      >
        {children}
      </span>
    </div>
  );
}

function TaskStatusIcon({ status }: { status: TaskStatus }) {
  if (status === "running") {
    return (
      <IconLoader2 className="size-3.5 animate-spin text-accent" stroke={1.5} />
    );
  }
  if (status === "completed") {
    return <IconCheck className="size-3.5 text-success" stroke={1.5} />;
  }
  if (status === "failed") {
    return <IconAlertTriangle className="size-3.5 text-danger" stroke={1.5} />;
  }
  return <IconClock className="size-3.5 text-muted" stroke={1.5} />;
}

export { Task, type TaskProps, type TaskStatus };
