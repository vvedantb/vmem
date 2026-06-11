import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-expo";
import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import { useIsOnline } from "@/providers/NetworkProvider";
import {
  getStoredCloudModelId,
  setStoredCloudModelId,
} from "@/services/chat-prefs";
import type { ChatMemoryRef, MessageUsageSummary } from "./useLocalChat";

export function useCloudChat() {
  const { user, isLoaded } = useUser();
  const isOnline = useIsOnline();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [modelId, setModelIdState] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  // Covers the gap between initiateStreaming resolving and the first
  // streaming delta arriving, so the send button disables immediately.
  const [isSendPending, setIsSendPending] = useState(false);

  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const initiateStreaming = useMutation(api.chat.initiateStreaming);
  const clearChatHistory = useMutation(api.chat.clearChatHistory);
  const envVars = useQuery(api.userEnvVars.list, isOnline ? {} : "skip") ?? [];

  const hasOpenRouterKey = envVars.some(
    (entry) => entry.key === "OPENROUTER_API_KEY",
  );

  // Hydrate the stored model choice (SecureStore is async, unlike web's localStorage).
  useEffect(() => {
    getStoredCloudModelId()
      .then((stored) => {
        if (stored) setModelIdState((current) => current ?? stored);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isOnline || !isLoaded || !user) {
      setThreadId(null);
      return;
    }
    // No profileId: mobile chat resolves the default personal profile.
    getOrCreateThread({})
      .then((id) => setThreadId(id))
      .catch((error) => {
        console.error("Failed to load chat thread:", error);
      });
  }, [isOnline, isLoaded, user, getOrCreateThread]);

  const { results: messages } = useUIMessages(
    api.chat.listThreadMessages,
    isOnline && threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const usageByMessageKey: Record<string, MessageUsageSummary> =
    useQuery(
      api.chat.getThreadMessageUsage,
      isOnline && threadId ? { threadId } : "skip",
    ) ?? {};

  const memoryRefsByMessageKey: Record<string, ChatMemoryRef[]> =
    useQuery(
      api.chat.getThreadMessageMemoryRefs,
      isOnline && threadId ? { threadId } : "skip",
    ) ?? {};

  const hasStreamingMessage = useMemo(
    () => messages.some((message) => message.status === "streaming"),
    [messages],
  );

  useEffect(() => {
    if (hasStreamingMessage) setIsSendPending(false);
  }, [hasStreamingMessage]);

  const isStreaming = hasStreamingMessage || isSendPending;

  const setModelId = useCallback((nextModelId: string) => {
    setModelIdState(nextModelId);
    void setStoredCloudModelId(nextModelId);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (
        !text.trim() ||
        isStreaming ||
        threadId === null ||
        modelId === null ||
        !hasOpenRouterKey
      ) {
        return;
      }
      setIsSendPending(true);
      try {
        await initiateStreaming({ prompt: text, threadId, modelId });
      } catch (error) {
        setIsSendPending(false);
        throw error;
      }
    },
    [hasOpenRouterKey, initiateStreaming, isStreaming, modelId, threadId],
  );

  const clearHistory = useCallback(async () => {
    if (threadId === null || isClearing) return;
    setIsClearing(true);
    try {
      const newThreadId = await clearChatHistory({ threadId });
      setThreadId(newThreadId);
    } finally {
      setIsClearing(false);
    }
  }, [clearChatHistory, isClearing, threadId]);

  return {
    messages,
    sendMessage,
    clearHistory,
    isStreaming,
    isClearing,
    isThreadReady: threadId !== null,
    isReady: threadId !== null && hasOpenRouterKey && modelId !== null,
    hasOpenRouterKey,
    modelId,
    setModelId,
    usageByMessageKey,
    memoryRefsByMessageKey,
  };
}
