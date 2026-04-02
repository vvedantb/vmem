import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { Input } from "@/components/ui/Input";
import { THEME_COLORS } from "@/lib/theme";

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  disabled: boolean;
}

export default function ChatInput({
  value,
  onChangeText,
  onSend,
  disabled,
}: ChatInputProps) {
  const normalizedValue = typeof value === "string" ? value : "";
  const canSend = !disabled && normalizedValue.trim().length > 0;
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <View className="border-t border-border px-4 py-3 flex-row items-end gap-3">
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder="Ask about your memories..."
        placeholderTextColor={theme.muted}
        multiline
        maxLength={2000}
        className="flex-1 rounded-2xl px-4 py-3"
        style={{ maxHeight: 120 }}
      />
      <Pressable
        onPress={onSend}
        disabled={!canSend}
        className={`w-10 h-10 rounded-full items-center justify-center ${
          canSend ? "bg-primary" : "bg-muted"
        }`}
      >
        <Ionicons
          name="arrow-up"
          size={20}
          color={canSend ? theme.background : theme.muted}
        />
      </Pressable>
    </View>
  );
}
