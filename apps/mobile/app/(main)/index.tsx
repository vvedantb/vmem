import { useState, useRef } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  View,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import type { UIMessage } from "@convex-dev/agent/react";
import MessageBubble from "../../src/components/MessageBubble";
import EmptyState from "../../src/components/EmptyState";
import ChatInput from "../../src/components/ChatInput";
import { useChatProvider } from "@/hooks/useChatProvider";
import { Text } from "@/components/ui/text";
import { THEME_COLORS } from "@/lib/theme";

function normalizeChatInput(text: string | undefined): string {
  return typeof text === "string" ? text.trim() : "";
}

export default function ChatScreen() {
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList<UIMessage>>(null);
  const { messages, sendMessage, isStreaming, isReady, mode } =
    useChatProvider();
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;

  const handleSend = async (text: string | undefined) => {
    const prompt = normalizeChatInput(text);
    if (!prompt || isStreaming || !isReady) return;

    setInputText("");
    await sendMessage(prompt);
  };

  if (mode === "offline_no_model") {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-lg font-semibold text-foreground mb-2 text-center">
          No offline model available
        </Text>
        <Text className="text-sm text-muted-foreground text-center">
          Download the AI model in Settings to chat offline.
        </Text>
      </SafeAreaView>
    );
  }

  if (!isReady) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={theme.primary} />
        {mode === "offline" && (
          <Text className="mt-3 text-sm text-muted-foreground">
            Loading local model...
          </Text>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {messages.length === 0 ? (
          <EmptyState
            onSuggestionTap={handleSend}
            isOffline={mode === "offline"}
          />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={{
              paddingVertical: 16,
              paddingHorizontal: 16,
            }}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            onLayout={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}
        <ChatInput
          value={inputText}
          onChangeText={setInputText}
          onSend={() => handleSend(inputText)}
          disabled={isStreaming}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
