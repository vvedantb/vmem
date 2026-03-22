import { View, Text, TouchableOpacity } from "react-native";

const SUGGESTIONS = [
  "What do I know about React?",
  "Tell me about Docker",
  "Summarize my TypeScript notes",
];

interface EmptyStateProps {
  onSuggestionTap: (text: string) => void;
}

export default function EmptyState({ onSuggestionTap }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="items-center mb-8">
        <Text className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          Start a conversation
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 text-center text-sm">
          Ask anything about your stored memories. The AI will search and
          reference relevant information.
        </Text>
      </View>
      <View className="w-full max-w-xs gap-3">
        {SUGGESTIONS.map((suggestion) => (
          <TouchableOpacity
            key={suggestion}
            onPress={() => onSuggestionTap(suggestion)}
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3"
          >
            <Text className="text-gray-700 dark:text-gray-300 text-center text-sm">
              {suggestion}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
