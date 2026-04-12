/**
 * Hook for cloud-based chat via Convex agent (OpenRouter).
 * Extracted from Chat.tsx to enable dual-mode (cloud/local) switching.
 */
import { useState, useEffect, useCallback } from "react";
import { useMutation } from "convex/react";
import {
  useUIMessages,
  optimisticallySendMessage,
} from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";

interface CloudChatResult {
  messages: UIMessage[];
  sendMessage: (text: string) => Promise<void>;
  isStreaming: boolean;
  isReady: boolean;
  threadId: string | null;
}

export function useCloudChat(): CloudChatResult {
  const [threadId, setThreadId] = useState<string | null>(null);

  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const sendOnlineMessage = useMutation(
    api.chat.initiateStreaming,
  ).withOptimisticUpdate((store, args) => {
    optimisticallySendMessage(api.chat.listThreadMessages)(store, args);
  });

  useEffect(() => {
    getOrCreateThread()
      .then((id) => setThreadId(id))
      .catch((error) => {
        console.error("Failed to load chat thread:", error);
      });
  }, [getOrCreateThread]);

  const { results: messages } = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const isStreaming = messages.some(
    (m) => m.role === "assistant" && m.status === "streaming",
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !threadId) return;
      await sendOnlineMessage({ prompt: text, threadId });
    },
    [threadId, sendOnlineMessage],
  );

  return {
    messages,
    sendMessage,
    isStreaming,
    isReady: threadId !== null,
    threadId,
  };
}
