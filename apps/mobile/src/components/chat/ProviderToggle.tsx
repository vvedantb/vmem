import { Pressable, View } from "react-native";
import { IconCloud, IconCpu } from "@tabler/icons-react-native";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";
import type { ChatProviderMode } from "@/services/chat-prefs";

interface ProviderToggleProps {
  provider: ChatProviderMode;
  onChange: (provider: ChatProviderMode) => void;
  disabled?: boolean;
}

/** Segmented Local/Cloud pill — port of web ProviderToggle. */
export default function ProviderToggle({
  provider,
  onChange,
  disabled = false,
}: ProviderToggleProps) {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const renderOption = (
    mode: ChatProviderMode,
    label: string,
    Icon: typeof IconCpu,
  ) => {
    const isActive = provider === mode;
    return (
      <Pressable
        disabled={disabled}
        onPress={() => onChange(mode)}
        className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${
          isActive ? "bg-surface" : ""
        }`}
      >
        <Icon
          size={12}
          strokeWidth={1.5}
          color={isActive ? theme.foreground : theme.muted}
        />
        <Text
          className={`text-[11px] ${
            isActive ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View className="flex-row items-center rounded-full bg-default p-0.5">
      {renderOption("local", "Local", IconCpu)}
      {renderOption("cloud", "Cloud", IconCloud)}
    </View>
  );
}
