import { ActivityIndicator, Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  IconCheck,
  IconCpu,
  IconMicrophone,
  IconPlayerPlay,
  IconWaveSine,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";
import type { VoiceReadiness } from "@/hooks/useVoiceSession";

function ReadinessPill({
  label,
  ready,
  loading,
  Icon,
}: {
  label: string;
  ready: boolean;
  loading: boolean;
  Icon: typeof IconCpu;
}) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <View
      className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
        ready ? "bg-success/10" : "bg-surface-secondary/40"
      }`}
    >
      {ready ? (
        <IconCheck size={14} color={theme.success} strokeWidth={2} />
      ) : loading ? (
        <ActivityIndicator size="small" color={theme.muted} />
      ) : (
        <Icon size={14} color={theme.muted} />
      )}
      <Text
        className={`text-xs font-sans-medium ${
          ready ? "text-success" : "text-muted-foreground"
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

interface VoiceReadinessPillsProps {
  readiness: VoiceReadiness;
  llmLoading: boolean;
  /** False when no GGUF model is downloaded — shows the Settings link instead. */
  modelOnDisk: boolean;
  onLoadAll: () => void;
}

/** LLM/STT/TTS readiness pills + load button — port of web VoiceReadinessOverlay. */
export default function VoiceReadinessPills({
  readiness,
  llmLoading,
  modelOnDisk,
  onLoadAll,
}: VoiceReadinessPillsProps) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <View className="mt-6 items-center gap-3">
      <View className="flex-row items-center gap-2">
        <ReadinessPill
          label="LLM"
          ready={readiness.llmReady}
          loading={llmLoading}
          Icon={IconCpu}
        />
        <ReadinessPill
          label="STT"
          ready={readiness.sttReady}
          loading={false}
          Icon={IconMicrophone}
        />
        <ReadinessPill
          label="TTS"
          ready={readiness.ttsReady}
          loading={false}
          Icon={IconWaveSine}
        />
      </View>

      {!modelOnDisk ? (
        <Pressable onPress={() => router.push("/settings/models")}>
          <Text className="text-xs text-muted-foreground underline">
            Download a model in Settings to get started
          </Text>
        </Pressable>
      ) : llmLoading ? (
        <Text className="text-xs text-muted-foreground">
          Loading models, this may take a moment...
        </Text>
      ) : (
        <Pressable
          onPress={onLoadAll}
          className="flex-row items-center gap-1.5 rounded-lg bg-accent px-3 py-2 active:opacity-90"
        >
          <IconPlayerPlay
            size={14}
            color={theme.accentForeground}
            strokeWidth={2}
          />
          <Text className="text-sm font-sans-medium text-accent-foreground">
            Load All Models
          </Text>
        </Pressable>
      )}
    </View>
  );
}
