import { View, TextInput, TouchableOpacity, Text } from "react-native";

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

  return (
    <View className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 flex-row items-end gap-3">
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Ask about your memories..."
        placeholderTextColor="#9ca3af"
        multiline
        maxLength={2000}
        className="flex-1 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-base text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900"
        style={{ maxHeight: 120 }}
      />
      <TouchableOpacity
        onPress={onSend}
        disabled={!canSend}
        className={`w-10 h-10 rounded-full items-center justify-center ${
          canSend ? "bg-black dark:bg-white" : "bg-gray-200 dark:bg-gray-700"
        }`}
      >
        <Text
          className={`text-lg font-bold ${
            canSend
              ? "text-white dark:text-black"
              : "text-gray-400 dark:text-gray-500"
          }`}
        >
          ↑
        </Text>
      </TouchableOpacity>
    </View>
  );
}
