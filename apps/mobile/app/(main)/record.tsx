import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useNavigation, DrawerActions } from "expo-router/react-navigation";
import { IconMenu2 } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { useMutation, useQuery } from "convex/react";
import { useUIMessages } from "@convex-dev/agent/react";
import { useUser } from "@clerk/clerk-expo";
import { api } from "@vmem/backend";
import PersonaOrb, { type PersonaState } from "@/components/voice/PersonaOrb";
import VoiceControls from "@/components/voice/VoiceControls";
import VoiceHistorySheet from "@/components/voice/VoiceHistorySheet";
import VoiceReadinessPills from "@/components/voice/VoiceReadinessPills";
import VoiceStatusLine from "@/components/voice/VoiceStatusLine";
import { Text } from "@/components/ui/text";
import { useVoiceSession, type VoicePhase } from "@/hooks/useVoiceSession";
import { useIsOnline } from "@/providers/NetworkProvider";
import { THEME_COLORS } from "@/lib/theme";
import type { ChatMemoryRef } from "@/hooks/useChatProvider";

const PHASE_TO_PERSONA: Record<VoicePhase, PersonaState> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  error: "idle",
};

/** Voice assistant — port of web's /voice route (VoiceClient). */
export default function RecordScreen() {
  const navigation = useNavigation();
  const { user, isLoaded } = useUser();
  const isOnline = useIsOnline();
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  /* Shared thread with chat. */
  const [threadId, setThreadId] = useState<string | null>(null);
  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);

  useEffect(() => {
    if (!isOnline || !isLoaded || !user) {
      setThreadId(null);
      return;
    }
    getOrCreateThread()
      .then(setThreadId)
      .catch((err) => {
        console.error("Failed to get voice thread:", err);
      });
  }, [isOnline, isLoaded, user, getOrCreateThread]);

  const { results: messages } = useUIMessages(
    api.chat.listThreadMessages,
    isOnline && threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const memoryRefsByMessageKey: Record<string, ChatMemoryRef[]> =
    useQuery(
      api.chat.getThreadMessageMemoryRefs,
      isOnline && threadId ? { threadId } : "skip",
    ) ?? {};

  const voice = useVoiceSession({ threadId, messages });
  const { refreshReadiness, cancelSession } = voice;

  // Leaving the screen mid-turn stops the mic and any speech playback.
  useFocusEffect(
    useCallback(() => {
      void refreshReadiness();
      return () => cancelSession();
    }, [refreshReadiness, cancelSession]),
  );

  const allReady =
    voice.readiness.llmReady &&
    voice.readiness.sttReady &&
    voice.readiness.ttsReady;
  const canRecord = voice.readiness.llmReady && voice.readiness.sttReady;
  const personaState: PersonaState = allReady
    ? PHASE_TO_PERSONA[voice.phase]
    : "asleep";

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={8}
        >
          <IconMenu2 size={24} color={theme.foreground} />
        </Pressable>
        <Text className="flex-1 text-center text-lg font-sans-semibold text-foreground mr-6">
          Record
        </Text>
      </View>

      {/* Top spacer — pushes the orb cluster to center (web grid-rows-[1fr_auto_1fr]). */}
      <View className="flex-1" />

      <View className="items-center gap-5">
        <View className="items-center">
          <PersonaOrb state={personaState} size={200} />
          {!allReady && (
            <VoiceReadinessPills
              readiness={voice.readiness}
              llmLoading={voice.llmState === "loading"}
              modelOnDisk={voice.modelOnDisk}
              onLoadAll={() => void voice.loadAll()}
            />
          )}
        </View>

        <VoiceStatusLine
          phase={voice.phase}
          transcript={voice.transcript}
          replyText={voice.replyText}
          errorMessage={voice.errorMessage}
          allReady={allReady}
        />

        <VoiceControls
          phase={voice.phase}
          disabled={!canRecord}
          onStartRecording={() => void voice.startRecording()}
          onStopRecording={voice.stopRecording}
          onCancel={voice.cancelSession}
        />
      </View>

      {/* Bottom zone — history trigger anchored to bottom. */}
      <View className="flex-1 justify-end pb-2">
        <VoiceHistorySheet
          messages={messages}
          memoryRefsByMessageKey={memoryRefsByMessageKey}
        />
      </View>
    </SafeAreaView>
  );
}
