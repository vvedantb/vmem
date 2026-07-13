"use client";

import { memo, type HTMLAttributes, type ComponentProps } from "react";
import type { UIMessage } from "ai";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { code } from "./code-highlighter";
import { cn } from "../utils/cn";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

interface MessageProps extends HTMLAttributes<HTMLDivElement> {
  from: UIMessage["role"];
}

function Message({ from, className, ...props }: MessageProps) {
  return (
    <div
      data-role={from}
      className={cn(
        "group flex gap-3",
        from === "user" ? "justify-end" : "justify-start",
        className,
      )}
      {...props}
    />
  );
}

type MessageContentProps = HTMLAttributes<HTMLDivElement>;

function MessageContent({ className, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        "w-fit max-w-4xl rounded-lg px-4 py-3 text-sm",
        "group-data-[role=user]:bg-surface-secondary group-data-[role=user]:text-foreground group-data-[role=user]:rounded-br-md",
        "group-data-[role=assistant]:text-foreground group-data-[role=assistant]:px-0",
        className,
      )}
      {...props}
    />
  );
}

type MessageActionsProps = ComponentProps<"div">;

function MessageActions({ className, ...props }: MessageActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

interface MessageActionProps extends ComponentProps<typeof Button> {
  tooltip?: string;
  label?: string;
}

function MessageAction({
  tooltip,
  label,
  children,
  className,
  ...props
}: MessageActionProps) {
  const button = (
    <Button
      variant="ghost"
      size="icon-xs"
      className={cn("text-muted hover:text-foreground", className)}
      {...props}
    >
      {children}
      {label && <span className="sr-only">{label}</span>}
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

const streamdownPlugins = { cjk, code, math, mermaid };

type MessageResponseProps = ComponentProps<typeof Streamdown>;

const MessageResponse = memo(function MessageResponse({
  className,
  ...props
}: MessageResponseProps) {
  return (
    <Streamdown
      className={cn("prose prose-sm dark:prose-invert max-w-none", className)}
      plugins={streamdownPlugins}
      {...props}
    />
  );
});

type MessageToolbarProps = HTMLAttributes<HTMLDivElement>;

function MessageToolbar({ className, ...props }: MessageToolbarProps) {
  return (
    <div className={cn("flex items-center gap-1 mt-1", className)} {...props} />
  );
}

export {
  Message,
  MessageContent,
  MessageActions,
  MessageAction,
  MessageResponse,
  MessageToolbar,
  type MessageProps,
  type MessageContentProps,
  type MessageActionsProps,
  type MessageActionProps,
  type MessageResponseProps,
  type MessageToolbarProps,
};
