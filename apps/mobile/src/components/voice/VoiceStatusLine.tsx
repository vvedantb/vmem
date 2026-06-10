import { View } from "react-native";
import { Text } from "@/components/ui/text";
import type { VoicePhase } from "@/hooks/useVoiceSession";

const PHASE_LABELS: Record<VoicePhase, string> = {
  idle: "Ready to listen",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking...",
  error: "Something went wrong",
};

const PHASE_DOT_CLASS: Record<VoicePhase, string> = {
  idle: "bg-muted-foreground",
  listening: "bg-destructive",
  thinking: "bg-warning",
  speaking: "bg-success",
  error: "bg-destructive",
};

interface VoiceStatusLineProps {
  phase: VoicePhase;
  transcript: string | null;
  replyText: string | null;
  errorMessage: string | null;
  allReady: boolean;
}

/** Status dot + phase label + transcript/reply previews — port of web VoiceStatusLine. */
export default function VoiceStatusLine({
  phase,
  transcript,
  replyText,
  errorMessage,
  allReady,
}: VoiceStatusLineProps) {
  if (!allReady) {
    return (
      <View className="min-h-[48px] items-center gap-1">
        <Text className="text-sm text-muted-foreground/70">
          Load models to get started
        </Text>
      </View>
    );
  }

  return (
    <View className="min-h-[56px] items-center gap-2 px-6">
      <View className="flex-row items-center gap-2">
        <View className={`h-2 w-2 rounded-full ${PHASE_DOT_CLASS[phase]}`} />
        <Text className="text-sm font-sans-medium text-foreground/80">
          {phase === "error" && errorMessage
            ? errorMessage
            : PHASE_LABELS[phase]}
        </Text>
      </View>

      {transcript && phase !== "idle" && (
        <Text
          className="max-w-xs text-center text-xs italic text-muted-foreground/60"
          numberOfLines={1}
        >
          “{transcript}”
        </Text>
      )}

      {replyText && phase === "speaking" && (
        <Text
          className="max-w-sm text-center text-xs text-foreground/70"
          numberOfLines={2}
        >
          {replyText}
        </Text>
      )}
    </View>
  );
}
