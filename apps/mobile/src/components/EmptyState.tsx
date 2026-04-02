import { View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

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
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="items-center mb-8">
        <Ionicons
          name="sparkles-outline"
          size={32}
          color={theme.muted}
          style={{ marginBottom: 12 }}
        />
        <Text className="text-2xl font-semibold text-foreground mb-2">
          Start a conversation
        </Text>
        <Text className="text-muted-foreground text-center text-sm">
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
            className="border border-border rounded-xl px-4 py-3 bg-secondary/50 active:bg-secondary"
          >
            <Text className="text-secondary-foreground text-center text-sm">
              {suggestion}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
