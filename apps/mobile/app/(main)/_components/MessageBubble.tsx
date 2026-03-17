import { View, Text } from "react-native";
import { useSmoothText } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";

function StreamingDots() {
  return (
    <View className="flex-row gap-1 py-1">
      <View className="w-2 h-2 rounded-full bg-gray-400 opacity-60" />
      <View className="w-2 h-2 rounded-full bg-gray-400 opacity-60" />
      <View className="w-2 h-2 rounded-full bg-gray-400 opacity-60" />
    </View>
  );
}

interface MessageBubbleProps {
  message: UIMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";
  const isStreaming = message.status === "streaming";

  const [smoothText] = useSmoothText(message.text, {
    startStreaming: isStreaming,
  });

  const displayText = isStreaming ? smoothText : message.text;

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
      </View>
    </View>
  );
}
