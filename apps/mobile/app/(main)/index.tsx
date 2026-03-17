import { useState, useEffect, useRef, useCallback } from "react";
import { FlatList, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation } from "convex/react";
import {
  useUIMessages,
  optimisticallySendMessage,
} from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import MessageBubble from "./_components/MessageBubble";
import EmptyState from "./_components/EmptyState";
import ChatInput from "./_components/ChatInput";

export default function ChatScreen() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList<UIMessage>>(null);

  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const sendMessage = useMutation(
    api.chat.initiateStreaming,
  ).withOptimisticUpdate((store, args) => {
    optimisticallySendMessage(api.chat.listThreadMessages)(store, args);
  });

  useEffect(() => {
    getOrCreateThread().then((id) => setThreadId(id));
  }, [getOrCreateThread]);

  const { results: messages } = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const isStreaming = messages.some(
    (m) => m.role === "assistant" && m.status === "streaming",
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || !threadId || isStreaming) return;
      setInputText("");
      await sendMessage({ prompt: text.trim(), threadId });
    },
    [threadId, isStreaming, sendMessage],
  );

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {messages.length === 0 ? (
          <EmptyState onSuggestionTap={handleSend} />
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
          disabled={isStreaming || !threadId}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
