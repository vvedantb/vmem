import { useEffect, useRef, useState } from "react";
import { Animated, TouchableOpacity, View } from "react-native";
import { IconChevronDown, IconSparkles } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

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

/** Collapsible extended-thinking block — mobile port of web's ChainOfThought. */
export default function ReasoningBlock({
  text,
  isStreaming,
}: ReasoningBlockProps) {
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

  // Auto-expand while thinking; auto-collapse 1s after it finishes unless the
  // user closed it themselves.
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
    closedManuallyRef.current = !next;
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
        <View className="h-6 w-6 items-center justify-center rounded-full bg-surface-secondary">
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
        <View className="mt-2 rounded-lg bg-surface-secondary/40 p-3">
          <Text className="text-sm leading-relaxed text-muted-foreground">
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}
