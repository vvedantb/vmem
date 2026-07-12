import { Image, Pressable, View } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import iconSource from "../../../assets/icon.png";

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

export type ChatEmptyVariant =
  | "no_local_model"
  | "cloud_key_required"
  | "ready";

interface ChatEmptyStateProps {
  variant: ChatEmptyVariant;
  /** Active provider when variant is "ready" — picks the description copy. */
  isLocal: boolean;
  isOffline: boolean;
  onSuggestionTap: (text: string) => void;
}

function VmemRoundel() {
  return (
    <View className="mb-3 h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-surface-secondary">
      <Image
        source={iconSource}
        style={{ width: 22, height: 22, borderRadius: 11 }}
      />
    </View>
  );
}

/** Empty-state variants — port of web Chat.tsx's three ConversationEmptyStates (+ offline copy). */
export default function ChatEmptyState({
  variant,
  isLocal,
  isOffline,
  onSuggestionTap,
}: ChatEmptyStateProps) {
  if (variant === "no_local_model") {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <VmemRoundel />
        <Text className="mb-2 text-2xl font-sans-semibold text-foreground">
          No local model loaded
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          Select a model below to start chatting.
        </Text>
        <Pressable
          onPress={() => router.push("/settings/models")}
          className="mt-2"
        >
          <Text className="text-xs text-muted-foreground underline">
            Or manage models in Settings
          </Text>
        </Pressable>
      </View>
    );
  }

  if (variant === "cloud_key_required") {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <VmemRoundel />
        <Text className="mb-2 text-2xl font-sans-semibold text-foreground">
          OpenRouter API key required
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          Add OPENROUTER_API_KEY in Settings → Secrets to use cloud chat with
          free models and vmem tools.
        </Text>
        <Pressable
          onPress={() => router.push("/settings/secrets")}
          className="mt-2"
        >
          <Text className="text-xs text-muted-foreground underline">
            Configure secrets
          </Text>
        </Pressable>
      </View>
    );
  }

  const suggestions = isOffline ? OFFLINE_SUGGESTIONS : ONLINE_SUGGESTIONS;

  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="mb-8 items-center">
        <VmemRoundel />
        <Text className="mb-2 text-2xl font-sans-semibold text-foreground">
          Start a conversation
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          {isOffline
            ? "You're offline. Chat with the local AI model — memory search is not available."
            : isLocal
              ? "Ask anything — running locally on your device."
              : "Ask anything — cloud model with vmem tools (memories, skills, wiki)."}
        </Text>
      </View>
      <View className="w-full max-w-xs gap-3">
        {suggestions.map((suggestion) => (
          <Pressable
            key={suggestion}
            onPress={() => onSuggestionTap(suggestion)}
            className="rounded-xl bg-surface-secondary/60 px-4 py-3 active:bg-surface-tertiary"
          >
            <Text className="text-center text-sm text-foreground">
              {suggestion}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
