"use client";

import { Fragment, useState, useCallback, type ReactNode } from "react";
import { useSmoothText } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import { segmentInputBySkills } from "@vmem/shared";
import { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";
import {
  SKILL_CHIP_CLASS,
  SKILL_CHIP_INTERACTIVE_CLASS,
} from "../_utils/mentionChipStyles";
import { SkillChipHoverPreview } from "./SkillChipHoverPreview";
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
import { HoverCard, HoverCardContent, HoverCardTrigger, cn } from "@vmem/ui";
import {
  IconCheck,
  IconCloud,
  IconCopy,
  IconMicrophone,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useActiveProfile } from "@/components/workspace/active-profile";
import type { ChatMemoryRef, MessageUsageSummary } from "@/hooks/useLocalChat";

function StreamingDots() {
  return (
    <div className="flex gap-1.5 py-1">
      <span className="size-2 rounded-full bg-surface-tertiary/40 animate-pulse" />
      <span className="size-2 rounded-full bg-surface-tertiary/40 animate-pulse" />
      <span className="size-2 rounded-full bg-surface-tertiary/40 animate-pulse" />
    </div>
  );
}

/**
 * One-row horizontal score bar for the memory-ref hover card.
 *
 * Values come from the retrieval service on mixed scales:
 *   - fulltext: raw Lucene score (can exceed 1)
 *   - vector: cosine similarity (0..1)
 *   - recency: bucketed 0..1
 *   - confidence: stored 0..1
 *
 * We clamp the rendered bar to [0, 1] so it stays readable, but the numeric
 * value on the right shows the raw score so power users can see real magnitudes.
 */
function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="w-[88px] shrink-0 text-[10px] text-muted">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-foreground/70"
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

/**
 * Compact chip for a memory pulled by retrieval. Always renders the link;
 * wraps it in a hover card when the ref carries a trace payload (memories
 * retrieved after hybrid search shipped). Legacy rows without a trace
 * simply render the link unwrapped.
 */
function MemoryRefChip({ ref }: { ref: ChatMemoryRef }) {
  const activeProfile = useActiveProfile();
  const chip = (
    <Link
      to="/$profileId/memories/graph"
      params={{ profileId: activeProfile._id }}
      search={(prev) => ({ ...prev, focus: ref.id })}
      className="inline-flex max-w-[220px] items-center rounded-md bg-default px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-default/78 hover:text-foreground"
    >
      <span className="truncate">{ref.title}</span>
    </Link>
  );

  if (!ref.trace) return chip;

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-72">
        <div className="mb-1 truncate text-xs font-medium text-foreground">
          {ref.title}
        </div>
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            Retrieval score
          </span>
          <span className="text-sm font-medium tabular-nums">
            {ref.trace.score.toFixed(2)}
          </span>
        </div>
        <div className="space-y-1.5">
          <ScoreBar
            label="Content match"
            value={ref.trace.scoreBreakdown.fulltext}
          />
          <ScoreBar
            label="Semantic match"
            value={ref.trace.scoreBreakdown.vector}
          />
          <ScoreBar label="Recency" value={ref.trace.scoreBreakdown.recency} />
          <ScoreBar
            label="Confidence"
            value={ref.trace.scoreBreakdown.confidence}
          />
        </div>
        <p className="mt-3 text-[11px] italic leading-snug text-muted">
          {ref.trace.reason}
        </p>
      </HoverCardContent>
    </HoverCard>
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
    case "vmem-cloud":
      return {
        icon: <IconCloud className="size-3.5" stroke={1.5} />,
        tooltip: "Cloud",
      };
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

type SkillChip = FunctionReturnType<
  typeof api.skills.listEffectiveSkills
>[number];

/**
 * A `/skill` mention in a sent message: the same accent pill as the input,
 * but clickable (opens the skill's detail page) with a hover preview.
 */
function SkillMentionChip({
  skill,
  label,
}: {
  skill: SkillChip;
  label: string;
}) {
  const { _id: profileId } = useActiveProfile();
  const chipClass = cn(SKILL_CHIP_CLASS, SKILL_CHIP_INTERACTIVE_CLASS);

  const chip =
    skill.source === "system" && skill.systemSkillId !== undefined ? (
      <Link
        to="/$profileId/skills/system/$skillId"
        params={{ profileId, skillId: skill.systemSkillId }}
        className={chipClass}
      >
        {label}
      </Link>
    ) : skill.skillId !== undefined ? (
      <Link
        to="/$profileId/skills/$id"
        params={{ profileId, id: skill.skillId }}
        className={chipClass}
      >
        {label}
      </Link>
    ) : (
      <span className={SKILL_CHIP_CLASS}>{label}</span>
    );

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        className="w-auto border-0 bg-transparent p-0 shadow-none"
      >
        <SkillChipHoverPreview skill={skill} />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * Render a user message, turning recognized `/skill` mentions into the
 * interactive chips above. Plain text when no skills are known.
 */
function renderUserText(
  text: string,
  skillsByName?: ReadonlyMap<string, SkillChip>,
): ReactNode {
  if (!skillsByName || skillsByName.size === 0) return text;
  const names = new Set(skillsByName.keys());
  return segmentInputBySkills(text, names).map((segment, index) => {
    const skill =
      segment.kind === "skill" ? skillsByName.get(segment.name) : undefined;
    return skill ? (
      <SkillMentionChip key={index} skill={skill} label={segment.text} />
    ) : (
      <Fragment key={index}>{segment.text}</Fragment>
    );
  });
}

interface ChatMessageItemProps {
  message: UIMessage;
  usage?: MessageUsageSummary;
  memoryRefs?: ChatMemoryRef[];
  /** Model's context window size in tokens. Defaults to 4096. */
  maxContextTokens?: number;
  /** The user's effective skills, keyed by name, for rendering `/skill` chips. */
  skillsByName?: ReadonlyMap<string, SkillChip>;
}

export default function ChatMessageItem({
  message,
  usage,
  memoryRefs,
  maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS,
  skillsByName,
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
                    className="p-3 rounded-lg bg-surface-secondary/30"
                  >
                    <div className="text-sm font-medium text-foreground mb-1">
                      {source.title ?? `Source ${idx + 1}`}
                    </div>
                    <div className="text-xs text-muted truncate">
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
            <span className="whitespace-pre-wrap">
              {renderUserText(displayText, skillsByName)}
            </span>
          )}
        </MessageContent>

        {isAssistant && memoryRefs !== undefined && memoryRefs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {memoryRefs.map((ref) => (
              <MemoryRefChip key={ref.id} ref={ref} />
            ))}
          </div>
        )}

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
