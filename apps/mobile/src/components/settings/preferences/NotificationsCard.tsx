import { Switch, View } from "react-native";
import { useColorScheme } from "nativewind";
import SettingRow from "@/components/settings/SettingRow";
import { THEME_COLORS } from "@/lib/theme";

interface NotificationsCardProps {
  notifyMemoryConflicts: boolean;
  notifyNewMemories: boolean;
  notifyMemoriesExpiring: boolean;
  onToggle: (
    field:
      | "notifyMemoryConflicts"
      | "notifyNewMemories"
      | "notifyMemoriesExpiring",
    value: boolean,
  ) => void;
}

export default function NotificationsCard({
  notifyMemoryConflicts,
  notifyNewMemories,
  notifyMemoriesExpiring,
  onToggle,
}: NotificationsCardProps) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;
  const trackColor = { true: theme.accent, false: theme.surfaceTertiary };

  return (
    <View className="gap-6 rounded-xl bg-card p-4">
      <SettingRow
        label="Memory conflicts"
        description="Notify when proposed updates conflict with existing memories."
      >
        <Switch
          value={notifyMemoryConflicts}
          onValueChange={(value) => onToggle("notifyMemoryConflicts", value)}
          trackColor={trackColor}
          thumbColor={theme.surface}
        />
      </SettingRow>
      <SettingRow
        label="New memories"
        description="Notify when new memories are automatically extracted."
      >
        <Switch
          value={notifyNewMemories}
          onValueChange={(value) => onToggle("notifyNewMemories", value)}
          trackColor={trackColor}
          thumbColor={theme.surface}
        />
      </SettingRow>
      <SettingRow
        label="Expiring memories"
        description="Notify when memories are about to be archived."
      >
        <Switch
          value={notifyMemoriesExpiring}
          onValueChange={(value) => onToggle("notifyMemoriesExpiring", value)}
          trackColor={trackColor}
          thumbColor={theme.surface}
        />
      </SettingRow>
    </View>
  );
}
