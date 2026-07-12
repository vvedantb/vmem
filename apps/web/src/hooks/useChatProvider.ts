"use client";

import { useCallback, useState } from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import { useCloudChat } from "./useCloudChat";
import { useLocalChat } from "./useLocalChat";
import type { ChatMemoryRef, MessageUsageSummary } from "./useLocalChat";

export type ChatProviderMode = "local" | "cloud";

const PROVIDER_STORAGE_KEY = "vmem:chatProvider";

function readStoredProvider(): ChatProviderMode {
  if (typeof window === "undefined") return "local";
  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
  return stored === "cloud" ? "cloud" : "local";
}

interface SharedChatResult {
  messages: UIMessage[];
  sendMessage: (text: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  isStreaming: boolean;
  isClearing: boolean;
  isThreadReady: boolean;
  isReady: boolean;
  usageByMessageKey: Record<string, MessageUsageSummary>;
  memoryRefsByMessageKey: Record<string, ChatMemoryRef[]>;
}

export function useChatProvider() {
  const [provider, setProviderState] =
    useState<ChatProviderMode>(readStoredProvider);
  const local = useLocalChat();
  const cloud = useCloudChat();

  const setProvider = useCallback((next: ChatProviderMode) => {
    setProviderState(next);
    localStorage.setItem(PROVIDER_STORAGE_KEY, next);
  }, []);

  const active: SharedChatResult = provider === "cloud" ? cloud : local;

  return {
    provider,
    setProvider,
    ...active,
    hasOpenRouterKey: cloud.hasOpenRouterKey,
    cloudModelId: cloud.modelId,
    setCloudModelId: cloud.setModelId,
  };
}
