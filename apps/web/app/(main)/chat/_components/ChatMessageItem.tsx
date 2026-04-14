"use client";

import { useState, useCallback, type ReactNode } from "react";
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
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextSpeedUsage,
  ContextTrigger,
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
import {
  IconCheck,
  IconCopy,
  IconMicrophone,
  IconUser,
} from "@tabler/icons-react";
import type { MessageUsageSummary } from "@/hooks/useLocalChat";

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

/** Map `agentName` to a provider icon + tooltip. */
function getProviderMeta(agentName?: string): {
  icon: ReactNode;
  tooltip: string;
} | null {
  switch (agentName) {
    case "vmem-local-voice":
      return {
        icon: <IconMicrophone className="size-3.5" stroke={1.5} />,
        tooltip: "Voice",
      };
    default:
      return null;
  }
}

/** Fallback when caller doesn't know the model's context window. */
const DEFAULT_MAX_CONTEXT_TOKENS = 4096;

interface ChatMessageItemProps {
  message: UIMessage;
  usage?: MessageUsageSummary;
  /** Model's context window size in tokens. Defaults to 4096. */
  maxContextTokens?: number;
}

export default function ChatMessageItem({
  message,
  usage,
  maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS,
}: ChatMessageItemProps) {
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
  const providerMeta = getProviderMeta(message.agentName);

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
          <Actions className="mt-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Action tooltip="Copy" label="Copy response" onClick={handleCopy}>
              {copied ? (
                <IconCheck className="size-3.5" stroke={1.5} />
              ) : (
                <IconCopy className="size-3.5" stroke={1.5} />
              )}
            </Action>

            {providerMeta && (
              <Action
                tooltip={providerMeta.tooltip}
                label={providerMeta.tooltip}
              >
                {providerMeta.icon}
              </Action>
            )}

            {usage && (
              <Context
                usage={usage}
                usedTokens={usage.totalTokens}
                maxTokens={maxContextTokens}
              >
                <ContextTrigger />
                <ContextContent>
                  <ContextContentHeader />
                  <ContextContentBody>
                    <ContextInputUsage />
                    <ContextOutputUsage />
                    <ContextReasoningUsage />
                    <ContextCacheUsage />
                    <ContextSpeedUsage />
                  </ContextContentBody>
                </ContextContent>
              </Context>
            )}
          </Actions>
        )}
      </div>
    </Message>
  );
}
