import { useState, useCallback, useEffect, useRef } from "react";
import { View, TouchableOpacity, Animated } from "react-native";
import { useSmoothText } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import * as Clipboard from "expo-clipboard";
import {
  IconCopy,
  IconCheck,
  IconSparkles,
  IconChevronDown,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { THEME_COLORS } from "@/lib/theme";
import type { ChatMemoryRef } from "@/hooks/useChatProvider";

function StreamingDots() {
  return (
    <View className="flex-row gap-1 py-1">
      <View className="w-2 h-2 rounded-full bg-muted-foreground opacity-40" />
      <View className="w-2 h-2 rounded-full bg-muted-foreground opacity-40" />
      <View className="w-2 h-2 rounded-full bg-muted-foreground opacity-40" />
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

function ShimmerText({ children }: { children: string }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.Text
      style={{ opacity }}
      className="text-sm font-sans-medium text-muted-foreground"
    >
      {children}
    </Animated.Text>
  );
}

interface ReasoningBlockProps {
  text: string;
  isStreaming: boolean;
}

function ReasoningBlock({ text, isStreaming }: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const closedManuallyRef = useRef(false);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotation]);

  useEffect(() => {
    if (isStreaming) {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      if (!closedManuallyRef.current) setExpanded(true);
    } else if (startTimeRef.current) {
      setDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
      startTimeRef.current = null;
      const timer = setTimeout(() => {
        if (!closedManuallyRef.current) setExpanded(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  const handleToggle = () => {
    const next = !expanded;
    if (!next) closedManuallyRef.current = true;
    else closedManuallyRef.current = false;
    setExpanded(next);
  };

  const rotateInterpolation = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const thinkingText = isStreaming
    ? "Thinking..."
    : `Thought for ${duration} second${duration !== 1 ? "s" : ""}`;

  return (
    <View className="mb-3">
      <TouchableOpacity
        onPress={handleToggle}
        className="flex-row items-center gap-2 py-1"
      >
        <View className="w-6 h-6 items-center justify-center rounded-full bg-muted">
          <IconSparkles size={14} color={theme.muted} />
        </View>
        {isStreaming ? (
          <ShimmerText>{thinkingText}</ShimmerText>
        ) : (
          <Text className="text-sm font-sans-medium text-muted-foreground">
            {thinkingText}
          </Text>
        )}
        <Animated.View style={{ transform: [{ rotate: rotateInterpolation }] }}>
          <IconChevronDown size={14} color={theme.muted} />
        </Animated.View>
      </TouchableOpacity>

      {expanded && (
        <View className="mt-2 rounded-lg border border-border p-3 bg-muted/30">
          <Text className="text-sm text-muted-foreground leading-relaxed">
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}

interface MessageBubbleProps {
  message: UIMessage;
  memoryRefs?: ChatMemoryRef[];
}

export default function MessageBubble({
  message,
  memoryRefs,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === "assistant";
  const isStreaming = message.status === "streaming";
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

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

  if (isAssistant) {
    return (
      <View className="mb-4">
        {reasoningParts.length > 0 && (
          <ReasoningBlock
            text={reasoningParts
              .map((p) => ("text" in p ? String(p.text) : ""))
              .join("\n")}
            isStreaming={isStreaming}
          />
        )}

        {toolParts.map((toolPart) => (
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
          <Text className="text-base leading-relaxed text-foreground">
            {displayText}
          </Text>
        )}

        {!isStreaming &&
          displayText &&
          memoryRefs !== undefined &&
          memoryRefs.length > 0 && (
            <View className="mt-2 flex-row flex-wrap gap-1.5">
              {memoryRefs.map((ref) => (
                <Badge
                  key={ref.id}
                  variant="secondary"
                  className="max-w-[200px]"
                >
                  <Text className="truncate text-xs">{ref.title}</Text>
                </Badge>
              ))}
            </View>
          )}

        {!isStreaming && displayText && (
          <TouchableOpacity
            onPress={handleCopy}
            className="mt-2 self-start p-1"
          >
            {copied ? (
              <IconCheck size={14} color={theme.muted} />
            ) : (
              <IconCopy size={14} color={theme.muted} />
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View className="mb-3 flex-row justify-end">
      <View
        className="rounded-2xl rounded-tr-sm bg-primary px-4 py-3"
        style={{ maxWidth: "80%" }}
      >
        <Text className="text-base leading-relaxed text-primary-foreground">
          {displayText}
        </Text>
      </View>
    </View>
  );
}
