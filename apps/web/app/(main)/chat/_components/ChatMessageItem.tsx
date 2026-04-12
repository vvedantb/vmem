"use client";

import { useState, useCallback } from "react";
import { useSmoothText } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import {
  isReasoningUIPart,
  isToolOrDynamicToolUIPart,
  getToolOrDynamicToolName,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";
import {
  Action,
  Actions,
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtTrigger,
  InlineCitation,
  Message,
  MessageContent,
  MessageResponse,
  Sources,
  SourcesContent,
  SourcesTrigger,
  Task,
  Tool,
  ToolInput,
  ToolOutput,
} from "@vmem/ui/ai";
import { IconUser, IconCopy, IconCheck } from "@tabler/icons-react";
import Image from "next/image";

function AssistantAvatar() {
  return (
    <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-soft animate-pulse-slow dark:bg-black dark:shadow-soft">
      <Image
        unoptimized
        width={18}
        height={18}
        alt="vmem icon"
        src="/icon-dark.svg"
        className="block dark:hidden"
      />
      <Image
        unoptimized
        width={18}
        height={18}
        src="/icon-light.svg"
        alt="vmem icon"
        className="hidden dark:block"
      />
      <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15" />
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="flex size-8 items-center justify-center rounded-full bg-primary shrink-0">
      <IconUser className="size-4 text-primary-foreground" stroke={1.5} />
    </div>
  );
}

function StreamingDots() {
  return (
    <div className="flex gap-1.5 py-1">
      <span className="size-2 rounded-full bg-muted-foreground/40 animate-pulse" />
      <span className="size-2 rounded-full bg-muted-foreground/40 animate-pulse" />
      <span className="size-2 rounded-full bg-muted-foreground/40 animate-pulse" />
    </div>
  );
}

type ToolPart = ToolUIPart | DynamicToolUIPart;

function mapToolState(
  part: ToolPart,
): "input-available" | "running" | "output-available" | "output-error" {
  if (part.state === "output-available") return "output-available";
  if (part.state === "output-error") return "output-error";
  if (part.state === "input-available") return "input-available";
  return "running";
}

function mapTaskStatus(part: ToolPart): "running" | "completed" | "failed" {
  if (part.state === "output-available") return "completed";
  if (part.state === "output-error") return "failed";
  return "running";
}

/**
 * Map `agentName` to the user-facing badge label.
 * Centralised here so both `/chat` and `/voice` use the same mapping.
 */
function getProviderLabel(agentName?: string): string | null {
  switch (agentName) {
    case "vmem":
      return "Cloud";
    case "vmem-local":
      return "Local Text";
    case "vmem-local-voice":
      return "Local Voice";
    default:
      return null;
  }
}

interface ChatMessageItemProps {
  message: UIMessage;
}

export default function ChatMessageItem({ message }: ChatMessageItemProps) {
  const [copied, setCopied] = useState(false);
  const isStreaming = message.status === "streaming";
  const isAssistant = message.role === "assistant";

  const [smoothText] = useSmoothText(message.text, {
    startStreaming: isStreaming,
  });

  const displayText = isStreaming ? smoothText : message.text;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.text]);

  const reasoningParts = message.parts.filter(isReasoningUIPart);
  const toolParts = message.parts.filter(isToolOrDynamicToolUIPart);
  const sourceParts = message.parts.filter(
    (p): p is Extract<(typeof message.parts)[number], { type: "source-url" }> =>
      p.type === "source-url",
  );
  const providerLabel = getProviderLabel(message.agentName);

  return (
    <Message from={message.role}>
      <div
        className={`flex w-fit max-w-4xl flex-col ${
          isAssistant ? "items-start" : "items-end"
        }`}
      >
        {isAssistant && reasoningParts.length > 0 && (
          <div className="mb-2 w-full">
            <ChainOfThought isStreaming={isStreaming}>
              <ChainOfThoughtTrigger />
              <ChainOfThoughtContent>
                {reasoningParts.map((p) => p.text).join("\n")}
              </ChainOfThoughtContent>
            </ChainOfThought>
          </div>
        )}

        {isAssistant &&
          toolParts.map((toolPart) => {
            const toolName = getToolOrDynamicToolName(toolPart);
            return (
              <div key={toolPart.toolCallId} className="mb-2 w-full space-y-2">
                <Task status={mapTaskStatus(toolPart)}>Tool: {toolName}</Task>
                <Tool name={toolName} state={mapToolState(toolPart)}>
                  <div className="space-y-2">
                    {"input" in toolPart && toolPart.input !== undefined && (
                      <ToolInput input={toolPart.input} />
                    )}
                    {"output" in toolPart && toolPart.output !== undefined && (
                      <ToolOutput output={toolPart.output} />
                    )}
                  </div>
                </Tool>
              </div>
            );
          })}

        {isAssistant && sourceParts.length > 0 && (
          <div className="mb-2 w-full">
            <Sources>
              <SourcesTrigger
                count={sourceParts.length}
                label={sourceParts.length === 1 ? "source" : "sources"}
              />
              <SourcesContent>
                {sourceParts.map((source, idx) => (
                  <div
                    key={source.sourceId}
                    className="p-3 rounded-lg border border-border bg-muted/30"
                  >
                    <div className="text-sm font-medium text-foreground mb-1">
                      {source.title ?? `Source ${idx + 1}`}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {source.url}
                    </div>
                  </div>
                ))}
              </SourcesContent>
            </Sources>
          </div>
        )}

        <MessageContent>
          {isStreaming && !displayText ? (
            <StreamingDots />
          ) : isAssistant ? (
            <MessageResponse>{displayText}</MessageResponse>
          ) : (
            <span className="whitespace-pre-wrap">{displayText}</span>
          )}
        </MessageContent>

        {isAssistant && sourceParts.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {sourceParts.map((source, idx) => (
              <InlineCitation
                key={source.sourceId}
                index={idx + 1}
                href={source.url}
              >
                [{idx + 1}] {source.title ?? `Source ${idx + 1}`}
              </InlineCitation>
            ))}
          </div>
        )}

        {isAssistant && !isStreaming && displayText && (
          <Actions className="mt-1">
            <Action tooltip="Copy" label="Copy response" onClick={handleCopy}>
              {copied ? (
                <IconCheck className="size-3.5" stroke={1.5} />
              ) : (
                <IconCopy className="size-3.5" stroke={1.5} />
              )}
            </Action>
          </Actions>
        )}

        {providerLabel !== null && (
          <div
            className={`mt-1 text-xs text-muted-foreground ${
              isAssistant ? "text-left" : "text-right"
            }`}
          >
            {providerLabel}
          </div>
        )}
      </div>
    </Message>
  );
}
