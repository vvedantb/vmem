import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  IconAdjustments,
  IconChevronRight,
  IconCpu,
  IconKey,
  IconUsers,
} from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import SettingsHeader from "@/components/settings/SettingsHeader";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

const SECTIONS = [
  {
    route: "/settings/models",
    label: "Models",
    description: "Offline AI models for local chat",
    icon: IconCpu,
  },
  {
    route: "/settings/preferences",
    label: "Preferences",
    description: "About me, memory behavior, Dream Mode, notifications",
    icon: IconAdjustments,
  },
  {
    route: "/settings/profiles",
    label: "Profiles",
    description: "Organize where memories get saved",
    icon: IconUsers,
  },
  {
    route: "/settings/secrets",
    label: "Secrets",
    description: "Encrypted keys like OPENROUTER_API_KEY",
    icon: IconKey,
  },
];

/** Settings hub — list screen routing to the per-section detail screens. */
export default function SettingsHubScreen() {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <SettingsHeader title="Settings" variant="menu" />
      <ScrollView className="flex-1 px-4">
        <View className="gap-1">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Pressable
                key={section.route}
                onPress={() => router.push(section.route)}
                className="flex-row items-center gap-3 rounded-xl px-3 py-3.5 active:bg-surface-tertiary"
              >
                <View className="h-9 w-9 items-center justify-center rounded-lg bg-surface-secondary">
                  <Icon size={18} color={theme.foreground} strokeWidth={1.7} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-sans-medium text-foreground">
                    {section.label}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {section.description}
                  </Text>
                </View>
                <IconChevronRight size={18} color={theme.muted} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
