import { useState, useCallback } from "react";
import { View, TouchableOpacity } from "react-native";
import { useSmoothText } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import * as Clipboard from "expo-clipboard";
import { Text } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";

function StreamingDots() {
  return (
    <View className="flex-row gap-1 py-1">
      <View className="w-2 h-2 rounded-full bg-muted-foreground opacity-60" />
      <View className="w-2 h-2 rounded-full bg-muted-foreground opacity-60" />
      <View className="w-2 h-2 rounded-full bg-muted-foreground opacity-60" />
    </View>
  );
}

function ToolCallBadge({ name, status }: { name: string; status: string }) {
  const variant =
    status === "output-available"
      ? "success"
      : status === "output-error"
        ? "destructive"
        : "warning";

  return (
    <Badge variant={variant} className="mb-2">
      <Text>Tool: {name}</Text>
    </Badge>
  );
}

function ReasoningBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      onPress={() => setExpanded((prev) => !prev)}
      className="mb-2 rounded-lg border border-border px-3 py-2"
    >
      <Text className="text-xs font-sans-medium text-muted-foreground">
        {expanded ? "Hide reasoning" : "Show reasoning"}
      </Text>
      {expanded && (
        <Text className="mt-1 text-xs text-muted-foreground">{text}</Text>
      )}
    </TouchableOpacity>
  );
}

interface MessageBubbleProps {
  message: UIMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === "assistant";
  const isStreaming = message.status === "streaming";

  const [smoothText] = useSmoothText(message.text, {
    startStreaming: isStreaming,
  });

  const displayText = isStreaming ? smoothText : message.text;

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.text]);

  const reasoningParts = message.parts.filter((p) => p.type === "reasoning");
  const toolParts = message.parts.filter((p) => p.type === "tool-invocation");

  return (
    <View
      className={`mb-3 flex-row ${isAssistant ? "justify-start" : "justify-end"}`}
    >
      <View
        className={`max-w-xs rounded-2xl px-4 py-3 ${
          isAssistant ? "bg-card rounded-tl-sm" : "bg-primary rounded-tr-sm"
        }`}
        style={{ maxWidth: "80%" }}
      >
        {isAssistant && reasoningParts.length > 0 && (
          <ReasoningBlock
            text={reasoningParts
              .map((p) => ("text" in p ? String(p.text) : ""))
              .join("\n")}
          />
        )}

        {isAssistant &&
          toolParts.map((toolPart) => (
            <ToolCallBadge
              key={
                "toolInvocationId" in toolPart
                  ? String(toolPart.toolInvocationId)
                  : String(toolPart.type)
              }
              name={
                "toolName" in toolPart ? String(toolPart.toolName) : "unknown"
              }
              status={"state" in toolPart ? String(toolPart.state) : "running"}
            />
          ))}

        {isStreaming && !displayText ? (
          <StreamingDots />
        ) : (
          <Text
            className={`text-base leading-relaxed ${
              isAssistant ? "text-card-foreground" : "text-primary-foreground"
            }`}
          >
            {displayText}
          </Text>
        )}

        {isAssistant && !isStreaming && displayText && (
          <TouchableOpacity onPress={handleCopy} className="mt-2 self-start">
            <Text className="text-xs text-muted-foreground">
              {copied ? "Copied" : "Copy"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
