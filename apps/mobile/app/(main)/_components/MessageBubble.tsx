import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSmoothText } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import * as Clipboard from "expo-clipboard";

function StreamingDots() {
  return (
    <View className="flex-row gap-1 py-1">
      <View className="w-2 h-2 rounded-full bg-gray-400 opacity-60" />
      <View className="w-2 h-2 rounded-full bg-gray-400 opacity-60" />
      <View className="w-2 h-2 rounded-full bg-gray-400 opacity-60" />
    </View>
  );
}

function ToolCallBadge({ name, status }: { name: string; status: string }) {
  const statusColor =
    status === "output-available"
      ? "bg-green-100 dark:bg-green-900"
      : status === "output-error"
        ? "bg-red-100 dark:bg-red-900"
        : "bg-yellow-100 dark:bg-yellow-900";

  return (
    <View className={`rounded-lg px-3 py-2 mb-2 ${statusColor}`}>
      <Text className="text-xs font-medium text-gray-700 dark:text-gray-300">
        Tool: {name}
      </Text>
    </View>
  );
}

function ReasoningBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      onPress={() => setExpanded((prev) => !prev)}
      className="mb-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
    >
      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {expanded ? "Hide reasoning" : "Show reasoning"}
      </Text>
      {expanded && (
        <Text className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          {text}
        </Text>
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
          isAssistant
            ? "bg-gray-100 dark:bg-gray-800 rounded-tl-sm"
            : "bg-black dark:bg-white rounded-tr-sm"
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
              isAssistant
                ? "text-gray-900 dark:text-white"
                : "text-white dark:text-black"
            }`}
          >
            {displayText}
          </Text>
        )}

        {isAssistant && !isStreaming && displayText && (
          <TouchableOpacity onPress={handleCopy} className="mt-2 self-start">
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              {copied ? "Copied" : "Copy"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
