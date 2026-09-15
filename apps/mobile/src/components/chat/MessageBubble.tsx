import { memo } from "react";
import { View } from "react-native";
import { useSmoothText } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import { isReasoningUIPart, isToolOrDynamicToolUIPart } from "ai";
import MarkdownResponse from "@/components/chat/MarkdownResponse";
import MemoryRefChips from "@/components/chat/MemoryRefChips";
import MessageActions from "@/components/chat/MessageActions";
import ReasoningBlock from "@/components/chat/ReasoningBlock";
import { InlineCitations, SourcesBlock } from "@/components/chat/SourcesBlock";
import ToolCallBlock from "@/components/chat/ToolCallBlock";
import { Text } from "@/components/ui/text";
import type {
  ChatMemoryRef,
  MessageUsageSummary,
} from "@/hooks/useChatProvider";

function StreamingDots() {
  return (
    <View className="flex-row gap-1 py-1">
      <View className="h-2 w-2 rounded-full bg-muted-foreground opacity-40" />
      <View className="h-2 w-2 rounded-full bg-muted-foreground opacity-40" />
      <View className="h-2 w-2 rounded-full bg-muted-foreground opacity-40" />
    </View>
  );
}

/** Fallback when the caller doesn't know the model's context window (web parity). */
const DEFAULT_MAX_CONTEXT_TOKENS = 4096;

interface MessageBubbleProps {
  message: UIMessage;
  usage?: MessageUsageSummary;
  memoryRefs?: ChatMemoryRef[];
  maxContextTokens?: number;
}

/**
 * One chat bubble — port of web's ChatMessageItem. Assistant messages render
 * reasoning, tool calls, sources, markdown, memory-ref chips, citations, and
 * the actions row; user messages render as an accent pill on the right.
 */
function MessageBubble({
  message,
  usage,
  memoryRefs,
  maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS,
}: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";
  const isStreaming = message.status === "streaming";

  const [smoothText] = useSmoothText(message.text, {
    startStreaming: isStreaming,
  });
  const displayText = isStreaming ? smoothText : message.text;

  const reasoningParts = message.parts.filter(isReasoningUIPart);
  const toolParts = message.parts.filter(isToolOrDynamicToolUIPart);
  const sourceParts = message.parts.filter(
    (p): p is Extract<(typeof message.parts)[number], { type: "source-url" }> =>
      p.type === "source-url",
  );

  if (isAssistant) {
    return (
      <View className="mb-4">
        {reasoningParts.length > 0 && (
          <ReasoningBlock
            text={reasoningParts.map((p) => p.text).join("\n")}
            isStreaming={isStreaming}
          />
        )}

        {toolParts.map((toolPart) => (
          <ToolCallBlock key={toolPart.toolCallId} part={toolPart} />
        ))}

        {sourceParts.length > 0 && <SourcesBlock sources={sourceParts} />}

        {isStreaming && !displayText ? (
          <StreamingDots />
        ) : (
          <MarkdownResponse text={displayText} />
        )}

        {memoryRefs !== undefined && memoryRefs.length > 0 && (
          <MemoryRefChips refs={memoryRefs} />
        )}

        {sourceParts.length > 0 && <InlineCitations sources={sourceParts} />}

        {!isStreaming && displayText ? (
          <MessageActions
            text={message.text}
            agentName={message.agentName}
            usage={usage}
            maxContextTokens={maxContextTokens}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View className="mb-3 flex-row justify-end">
      <View
        className="rounded-2xl rounded-br-md bg-accent px-4 py-3"
        style={{ maxWidth: "80%" }}
      >
        <Text className="text-base leading-relaxed text-accent-foreground">
          {displayText}
        </Text>
      </View>
    </View>
  );
}

export default memo(MessageBubble);
