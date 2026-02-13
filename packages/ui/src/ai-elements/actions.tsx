"use client";

import type { ComponentProps } from "react";
import { cn } from "../utils/cn";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

type ActionsProps = ComponentProps<"div">;

function Actions({ className, children, ...props }: ActionsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)} {...props}>
      {children}
    </div>
  );
}

type ActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

function Action({
  tooltip,
  label,
  children,
  className,
  variant = "ghost",
  size = "icon-xs",
  ...props
}: ActionProps) {
  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      {...props}
    >
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (!tooltip) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { Actions, Action, type ActionsProps, type ActionProps };
