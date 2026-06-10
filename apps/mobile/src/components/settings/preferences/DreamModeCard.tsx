import { useState } from "react";
import { Platform, Pressable, Switch, View } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useColorScheme } from "nativewind";
import { DEFAULT_LOCAL_TIME, utcTimeToLocal } from "@vmem/shared";
import SettingRow from "@/components/settings/SettingRow";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

function localTimeToDate(localTime: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(localTime);
  const date = new Date();
  if (match) {
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  }
  return date;
}

interface DreamModeCardProps {
  dreamModeAutoAccept: boolean;
  dreamModeScheduleEnabled: boolean;
  /** "HH:MM" UTC or null. */
  dreamModeScheduleTime: string | null;
  onToggleAutoAccept: (value: boolean) => void;
  onToggleSchedule: (enabled: boolean) => void;
  /** Receives the picked local "HH:MM". */
  onChangeScheduleTime: (localTime: string) => void;
}

export default function DreamModeCard({
  dreamModeAutoAccept,
  dreamModeScheduleEnabled,
  dreamModeScheduleTime,
  onToggleAutoAccept,
  onToggleSchedule,
  onChangeScheduleTime,
}: DreamModeCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const localTime =
    dreamModeScheduleTime !== null
      ? utcTimeToLocal(dreamModeScheduleTime)
      : DEFAULT_LOCAL_TIME;

  const handlePicked = (event: DateTimePickerEvent, date?: Date) => {
    // Android fires "dismissed" on cancel; iOS spinner fires "set" continuously.
    if (Platform.OS === "android") setPickerOpen(false);
    if (event.type !== "set" || !date) return;
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    onChangeScheduleTime(`${h}:${m}`);
  };

  return (
    <View className="gap-6 rounded-xl bg-card p-4">
      <SettingRow
        label="Auto-accept high-confidence synthesis"
        description="When on, high-confidence syntheses save as memories automatically. Otherwise they queue in your inbox for approval. Contradictions always queue regardless."
      >
        <Switch
          value={dreamModeAutoAccept}
          onValueChange={onToggleAutoAccept}
          trackColor={{ true: theme.accent, false: theme.surfaceTertiary }}
          thumbColor={theme.surface}
        />
      </SettingRow>

      <SettingRow
        label="Daily schedule"
        description="Run Dream Mode every day at this time. Stored as UTC; the local time shown shifts by an hour on DST transitions."
      >
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => setPickerOpen(true)}
            className="rounded-lg bg-surface-secondary px-3 py-1.5 active:bg-surface-tertiary"
          >
            <Text className="text-sm tabular-nums text-foreground">
              {localTime}
            </Text>
          </Pressable>
          <Switch
            value={dreamModeScheduleEnabled}
            onValueChange={onToggleSchedule}
            trackColor={{ true: theme.accent, false: theme.surfaceTertiary }}
            thumbColor={theme.surface}
          />
        </View>
      </SettingRow>

      {pickerOpen && (
        <DateTimePicker
          mode="time"
          value={localTimeToDate(localTime)}
          onChange={handlePicked}
          display={Platform.OS === "ios" ? "spinner" : "default"}
        />
      )}
    </View>
  );
}
