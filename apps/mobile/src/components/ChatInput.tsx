import { useState, useCallback } from "react";
import { View, TextInput, Pressable } from "react-native";
import { IconArrowUp, IconSquare } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import VoiceButton from "@/components/VoiceButton";
import { THEME_COLORS } from "@/lib/theme";

type VoiceState = "idle" | "listening";

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  disabled: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
}

export default function ChatInput({
  value,
  onChangeText,
  onSend,
  disabled,
  isStreaming = false,
  onStop,
}: ChatInputProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const normalizedValue = typeof value === "string" ? value : "";
  const canSend = !disabled && normalizedValue.trim().length > 0;
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const handleTranscription = useCallback(
    (text: string) => {
      const separator = normalizedValue.trim() ? " " : "";
      onChangeText(normalizedValue + separator + text);
    },
    [normalizedValue, onChangeText],
  );

  return (
    <View className="px-4 pb-3">
      <View className="rounded-xl border border-input bg-muted">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Ask about your memories..."
          placeholderTextColor={theme.muted}
          multiline
          maxLength={2000}
          className="px-3 py-3 text-base text-foreground"
          style={{ maxHeight: 120, fontFamily: "InstrumentSans_400Regular" }}
        />
        <View className="flex-row justify-end items-center gap-1 px-2 pb-2">
          <VoiceButton
            onTranscriptionChange={handleTranscription}
            state={voiceState}
            onStateChange={setVoiceState}
          />
          {isStreaming ? (
            <Pressable
              onPress={onStop}
              className="w-7 h-7 rounded-md items-center justify-center bg-destructive"
            >
              <IconSquare size={14} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              className={`w-7 h-7 rounded-md items-center justify-center ${
                canSend ? "bg-primary" : "bg-muted"
              }`}
            >
              <IconArrowUp
                size={14}
                color={canSend ? theme.background : theme.muted}
              />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
