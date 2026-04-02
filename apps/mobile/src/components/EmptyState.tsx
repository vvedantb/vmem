import { View, Text, TouchableOpacity } from "react-native";

const ONLINE_SUGGESTIONS = [
  "What do I know about React?",
  "Tell me about Docker",
  "Summarize my TypeScript notes",
];

const OFFLINE_SUGGESTIONS = [
  "What is TypeScript?",
  "Explain async/await",
  "How does React rendering work?",
];

interface EmptyStateProps {
  onSuggestionTap: (text: string) => void;
  isOffline?: boolean;
}

export default function EmptyState({
  onSuggestionTap,
  isOffline = false,
}: EmptyStateProps) {
  const suggestions = isOffline ? OFFLINE_SUGGESTIONS : ONLINE_SUGGESTIONS;

  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="items-center mb-8">
        <Text className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          Start a conversation
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 text-center text-sm">
          {isOffline
            ? "You're offline. Chat with the local AI model — memory search is not available."
            : "Ask anything about your stored memories. The AI will search and reference relevant information."}
        </Text>
      </View>
      <View className="w-full max-w-xs gap-3">
        {suggestions.map((suggestion) => (
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
