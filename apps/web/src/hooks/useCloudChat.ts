"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import type { ChatMemoryRef, MessageUsageSummary } from "./useLocalChat";

const CLOUD_MODEL_STORAGE_KEY = "vmem:cloudModelId";

function readStoredModelId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CLOUD_MODEL_STORAGE_KEY);
}

export function useCloudChat() {
  const activeProfile = useActiveProfile();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [modelId, setModelIdState] = useState<string | null>(readStoredModelId);
  const [isClearing, setIsClearing] = useState(false);

  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const initiateStreaming = useMutation(api.chat.initiateStreaming);
  const clearChatHistory = useMutation(api.chat.clearChatHistory);
  const envVars = useQuery(api.userEnvVars.list) ?? [];

  const hasOpenRouterKey = envVars.some(
    (entry) => entry.key === "OPENROUTER_API_KEY",
  );

  // One thread per workspace — switching workspaces swaps the thread.
  useEffect(() => {
    setThreadId(null);
    getOrCreateThread({ profileId: activeProfile._id })
      .then((id) => setThreadId(id))
      .catch((error) => {
        console.error("Failed to load chat thread:", error);
      });
  }, [getOrCreateThread, activeProfile._id]);

  const { results: messages } = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const usageByMessageKey: Record<string, MessageUsageSummary> =
    useQuery(
      api.chat.getThreadMessageUsage,
      threadId ? { threadId } : "skip",
    ) ?? {};

  const memoryRefsByMessageKey: Record<string, ChatMemoryRef[]> =
    useQuery(
      api.chat.getThreadMessageMemoryRefs,
      threadId ? { threadId } : "skip",
    ) ?? {};

  const isStreaming = useMemo(
    () => messages.some((message) => message.status === "streaming"),
    [messages],
  );

  const setModelId = useCallback((nextModelId: string) => {
    setModelIdState(nextModelId);
    localStorage.setItem(CLOUD_MODEL_STORAGE_KEY, nextModelId);
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

      await initiateStreaming({ prompt: text, threadId, modelId });
    },
    [hasOpenRouterKey, initiateStreaming, isStreaming, modelId, threadId],
  );

  const clearHistory = useCallback(async () => {
    if (threadId === null) return;
    setIsClearing(true);
    try {
      const newThreadId = await clearChatHistory({ threadId });
      setThreadId(newThreadId);
    } finally {
      setIsClearing(false);
    }
  }, [clearChatHistory, threadId]);

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
