import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from "react-native";
import { IconArrowUp } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import type { Doc } from "@vmem/backend";
import { segmentInputBySkills } from "@vmem/shared";
import VoiceButton from "@/components/VoiceButton";
import SkillSlashPicker, {
  filterSkillsByQuery,
  isSkillEnabled,
} from "@/components/chat/SkillSlashPicker";
import { Text } from "@/components/ui/text";
import { findSlashTrigger } from "@/lib/skillSlashTrigger";
import { THEME_COLORS } from "@/lib/theme";

type VoiceState = "idle" | "listening";

interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  disabled: boolean;
  isStreaming: boolean;
  placeholder: string;
  skills: Doc<"skills">[] | undefined;
  showVoice: boolean;
  /** Provider toggle + model selector, composed by the screen. */
  footerLeft: ReactNode;
}

/**
 * Chat input card — port of web's PromptInput + ChatPromptTextarea footer
 * layout, with the contentEditable skill editor replaced by a TextInput +
 * slash-picker overlay + skill-pill preview row.
 */
export default function ChatInputBar({
  value,
  onChangeText,
  onSend,
  disabled,
  isStreaming,
  placeholder,
  skills,
  showVoice,
  footerLeft,
}: ChatInputBarProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [cursor, setCursor] = useState(0);
  // One-shot controlled selection: set on skill insert, released on the next
  // selection event (Android misbehaves when `selection` is always controlled).
  const [selectionOverride, setSelectionOverride] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const canSend = !disabled && !isStreaming && value.trim().length > 0;

  const enabledSkills = useMemo(
    () => (skills ?? []).filter(isSkillEnabled),
    [skills],
  );
  const enabledSkillNames = useMemo(
    () => new Set(enabledSkills.map((skill) => skill.name)),
    [enabledSkills],
  );

  const trigger = findSlashTrigger(
    value.slice(0, cursor),
    enabledSkills.length > 0,
  );
  const filteredSkills = trigger
    ? filterSkillsByQuery(enabledSkills, trigger.query)
    : [];

  const skillSegments = useMemo(
    () =>
      segmentInputBySkills(value, enabledSkillNames).filter(
        (segment) => segment.kind === "skill",
      ),
    [value, enabledSkillNames],
  );

  const handleSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setCursor(event.nativeEvent.selection.start);
      setSelectionOverride(null);
    },
    [],
  );

  const handleSelectSkill = useCallback(
    (skill: Doc<"skills">) => {
      if (!trigger) return;
      const inserted = `/${skill.name} `;
      const next =
        value.slice(0, trigger.startIndex) + inserted + value.slice(cursor);
      const nextCursor = trigger.startIndex + inserted.length;
      onChangeText(next);
      setCursor(nextCursor);
      setSelectionOverride({ start: nextCursor, end: nextCursor });
    },
    [cursor, onChangeText, trigger, value],
  );

  const handleTranscription = useCallback(
    (text: string) => {
      const separator = value.trim() ? " " : "";
      onChangeText(value + separator + text);
    },
    [value, onChangeText],
  );

  return (
    <View className="px-4 pb-3">
      <View className="rounded-xl bg-surface-secondary/60">
        {trigger && (
          <SkillSlashPicker
            skills={skills}
            filteredSkills={filteredSkills}
            onSelect={handleSelectSkill}
          />
        )}

        {skillSegments.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 px-3 pt-2.5">
            {skillSegments.map((segment, index) => (
              <View
                key={`${segment.text}-${index}`}
                className="rounded-full bg-accent px-2 py-0.5"
              >
                <Text className="text-xs text-accent-foreground">
                  /{segment.kind === "skill" ? segment.name : ""}
                </Text>
              </View>
            ))}
          </View>
        )}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSelectionChange={handleSelectionChange}
          {...(selectionOverride ? { selection: selectionOverride } : {})}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          editable={!disabled}
          multiline
          maxLength={2000}
          className="px-3 py-3 text-base text-foreground"
          style={{ maxHeight: 120, fontFamily: "InstrumentSans_400Regular" }}
        />

        <View className="flex-row items-center justify-between px-2 pb-2">
          <View className="flex-row items-center gap-1.5">{footerLeft}</View>
          <View className="flex-row items-center gap-1">
            {showVoice && (
              <VoiceButton
                onTranscriptionChange={handleTranscription}
                state={voiceState}
                onStateChange={setVoiceState}
              />
            )}
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              className={`h-7 w-7 items-center justify-center rounded-md ${
                canSend ? "bg-accent" : "bg-default"
              }`}
            >
              <IconArrowUp
                size={14}
                color={canSend ? theme.accentForeground : theme.muted}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
