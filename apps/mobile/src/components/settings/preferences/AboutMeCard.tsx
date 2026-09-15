import { TextInput, View } from "react-native";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

interface AboutMeCardProps {
  aboutMe: string;
  preferences: string;
  onChangeAboutMe: (text: string) => void;
  onChangePreferences: (text: string) => void;
}

function FieldHeader({ label, length }: { label: string; length: number }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-sm font-sans-medium text-foreground">{label}</Text>
      <Text className="text-xs tabular-nums text-muted-foreground">
        {length}/500
      </Text>
    </View>
  );
}

/**
 * About me + Preferences textareas — bound directly to the live query value;
 * the caller's mutation carries an optimistic update so typing stays in sync.
 */
export default function AboutMeCard({
  aboutMe,
  preferences,
  onChangeAboutMe,
  onChangePreferences,
}: AboutMeCardProps) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const inputClass =
    "mt-2 rounded-lg bg-surface-secondary/60 px-3 py-3 text-sm text-foreground";

  return (
    <View className="rounded-xl bg-card p-4">
      <FieldHeader label="About me" length={aboutMe.length} />
      <TextInput
        value={aboutMe}
        onChangeText={onChangeAboutMe}
        placeholder="A few lines on who you are, what you do, and what you're working toward."
        placeholderTextColor={theme.muted}
        multiline
        maxLength={500}
        className={inputClass}
        style={{ minHeight: 96, textAlignVertical: "top" }}
      />

      <View className="mt-5">
        <FieldHeader label="Preferences" length={preferences.length} />
        <TextInput
          value={preferences}
          onChangeText={onChangePreferences}
          placeholder="How do you like AI to communicate with you? Tone, depth, formatting, things to avoid."
          placeholderTextColor={theme.muted}
          multiline
          maxLength={500}
          className={inputClass}
          style={{ minHeight: 96, textAlignVertical: "top" }}
        />
      </View>
    </View>
  );
}
