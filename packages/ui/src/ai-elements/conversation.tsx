"use client";

import {
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { IconArrowDown, IconDownload } from "@tabler/icons-react";
import { cn } from "../utils/cn";
import { Button } from "../ui/button";

type ConversationProps = ComponentProps<typeof StickToBottom>;

function Conversation({ className, ...props }: ConversationProps) {
  return (
    <StickToBottom
      className={cn("relative flex-1 overflow-hidden", className)}
      resize="smooth"
      initial="instant"
      {...props}
    />
  );
}

type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

function ConversationContent({
  className,
  ...props
}: ConversationContentProps) {
  return (
    <StickToBottom.Content
      className={cn("flex flex-col gap-4 p-4", className)}
      {...props}
    />
  );
}

interface ConversationEmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  icon?: ReactNode;
}

function ConversationEmptyState({
  title,
  description,
  icon,
  children,
  className,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-4 text-center",
        className,
      )}
      {...props}
    >
      {icon}
      {title && (
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
      )}
      {description && <p className="max-w-sm text-muted">{description}</p>}
      {children}
    </div>
  );
}

type ConversationScrollButtonProps = ComponentProps<typeof Button>;

function ConversationScrollButton({
  className,
  ...props
}: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;

  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={cn(
        "absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-md z-10",
        className,
      )}
      onClick={() => scrollToBottom()}
      {...props}
    >
      <IconArrowDown className="size-4" stroke={1.5} />
    </Button>
  );
}

interface ConversationMessage {
  role: "user" | "assistant" | "system" | "data" | "tool";
  content: string;
}

function messagesToMarkdown(messages: ConversationMessage[]): string {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map(
      (m) => `## ${m.role === "user" ? "User" : "Assistant"}\n\n${m.content}`,
    )
    .join("\n\n---\n\n");
}

interface ConversationDownloadProps extends Omit<
  ComponentProps<typeof Button>,
  "onClick"
> {
  messages: ConversationMessage[];
  filename?: string;
  formatMessage?: (messages: ConversationMessage[]) => string;
}

function ConversationDownload({
  messages,
  filename = "conversation.md",
  formatMessage = messagesToMarkdown,
  className,
  children,
  ...props
}: ConversationDownloadProps) {
  const handleDownload = () => {
    const content = formatMessage(messages);
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={handleDownload}
      {...props}
    >
      {children ?? <IconDownload className="size-4" stroke={1.5} />}
    </Button>
  );
}

export {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  ConversationDownload,
  messagesToMarkdown,
  type ConversationProps,
  type ConversationContentProps,
  type ConversationEmptyStateProps,
  type ConversationScrollButtonProps,
  type ConversationDownloadProps,
  type ConversationMessage,
};
