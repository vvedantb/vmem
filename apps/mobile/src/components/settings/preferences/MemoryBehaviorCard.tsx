import { Switch, View } from "react-native";
import Slider from "@react-native-community/slider";
import { useColorScheme } from "nativewind";
import SettingRow from "@/components/settings/SettingRow";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

interface MemoryBehaviorCardProps {
  memoryAutoExtract: boolean;
  memoryConfidenceThreshold: number;
  onToggleAutoExtract: (value: boolean) => void;
  /** Commits on slide end only, mirroring web's commit-on-mouseup slider. */
  onCommitConfidenceThreshold: (value: number) => void;
}

export default function MemoryBehaviorCard({
  memoryAutoExtract,
  memoryConfidenceThreshold,
  onToggleAutoExtract,
  onCommitConfidenceThreshold,
}: MemoryBehaviorCardProps) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <View className="gap-6 rounded-xl bg-card p-4">
      <SettingRow
        label="Auto-extract memories"
        description="Automatically extract memories from conversations."
      >
        <Switch
          value={memoryAutoExtract}
          onValueChange={onToggleAutoExtract}
          trackColor={{ true: theme.accent, false: theme.surfaceTertiary }}
          thumbColor={theme.surface}
        />
      </SettingRow>

      <View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-sans-medium text-foreground">
            Confidence threshold
          </Text>
          <Text className="text-sm tabular-nums text-muted-foreground">
            {memoryConfidenceThreshold}%
          </Text>
        </View>
        <Slider
          minimumValue={0}
          maximumValue={100}
          step={5}
          value={memoryConfidenceThreshold}
          onSlidingComplete={onCommitConfidenceThreshold}
          minimumTrackTintColor={theme.accent}
          maximumTrackTintColor={theme.surfaceSecondary}
          thumbTintColor={theme.accent}
          style={{ marginTop: 8 }}
        />
        <Text className="mt-1 text-xs text-muted-foreground">
          Only extract memories with confidence above this threshold.
        </Text>
      </View>
    </View>
  );
}
