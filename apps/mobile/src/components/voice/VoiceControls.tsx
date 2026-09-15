import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import { IconMicrophone, IconSquare, IconX } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { THEME_COLORS } from "@/lib/theme";
import type { VoicePhase } from "@/hooks/useVoiceSession";

function PingRing({ delay, size }: { delay: number; size: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const animation = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.6,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.3,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }, delay);
    return () => clearTimeout(timeout);
  }, [scale, opacity, delay]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "rgba(239, 68, 68, 0.15)",
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

interface VoiceControlsProps {
  phase: VoicePhase;
  disabled: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancel: () => void;
}

/** Push-to-talk mic + cancel — port of web VoiceControls (80px circle). */
export default function VoiceControls({
  phase,
  disabled,
  onStartRecording,
  onStopRecording,
  onCancel,
}: VoiceControlsProps) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const isListening = phase === "listening";
  const isProcessing = phase === "thinking" || phase === "speaking";
  const isIdle = phase === "idle" || phase === "error";

  return (
    <View className="flex-row items-center gap-4">
      <View className="relative items-center justify-center">
        {isListening && (
          <>
            <PingRing delay={0} size={80} />
            <PingRing delay={300} size={80} />
            <PingRing delay={600} size={80} />
          </>
        )}
        <Pressable
          disabled={disabled || isProcessing}
          onPress={isListening ? onStopRecording : onStartRecording}
          className={`h-20 w-20 items-center justify-center rounded-full ${
            isListening ? "bg-destructive" : "bg-accent"
          } ${disabled && !isProcessing ? "opacity-40" : ""} ${
            isProcessing ? "opacity-50" : ""
          }`}
          accessibilityLabel={
            isListening ? "Stop recording" : "Start recording"
          }
        >
          {isListening ? (
            <IconSquare size={32} color="#fff" strokeWidth={2} />
          ) : (
            <IconMicrophone
              size={32}
              color={theme.accentForeground}
              strokeWidth={2}
            />
          )}
        </Pressable>
      </View>

      {!isIdle && (
        <Pressable
          onPress={onCancel}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-tertiary/50"
          accessibilityLabel="Cancel"
        >
          <IconX size={20} color={theme.muted} strokeWidth={1.5} />
        </Pressable>
      )}
    </View>
  );
}
