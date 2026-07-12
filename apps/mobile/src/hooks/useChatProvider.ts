import { useCallback, useEffect, useState } from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import { useIsOnline } from "@/providers/NetworkProvider";
import {
  getStoredChatProvider,
  setStoredChatProvider,
  type ChatProviderMode,
} from "@/services/chat-prefs";
import { useCloudChat } from "./useCloudChat";
import { useLocalChat } from "./useLocalChat";
import type {
  ChatMemoryRef,
  LocalChatMode,
  MessageUsageSummary,
} from "./useLocalChat";

export type { ChatMemoryRef, ChatProviderMode, MessageUsageSummary };

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

export interface ChatProviderResult extends SharedChatResult {
  /** Stored provider choice. */
  provider: ChatProviderMode;
  /** Provider actually in use — cloud falls back to local while offline. */
  activeProvider: ChatProviderMode;
  setProvider: (next: ChatProviderMode) => void;
  /** Local-model readiness factoring connectivity (drives empty states). */
  mode: LocalChatMode;
  hasOpenRouterKey: boolean;
  cloudModelId: string | null;
  setCloudModelId: (modelId: string) => void;
  refreshLocalModel: () => Promise<void>;
}

export function useChatProvider(): ChatProviderResult {
  const isOnline = useIsOnline();
  const [provider, setProviderState] = useState<ChatProviderMode>("local");
  const local = useLocalChat();
  const cloud = useCloudChat();

  // Hydrate the stored choice (SecureStore is async, unlike web's localStorage).
  useEffect(() => {
    getStoredChatProvider()
      .then((stored) => setProviderState(stored))
      .catch(() => undefined);
  }, []);

  const setProvider = useCallback((next: ChatProviderMode) => {
    setProviderState(next);
    void setStoredChatProvider(next);
  }, []);

  // Cloud streaming needs Convex; force local while offline.
  const activeProvider: ChatProviderMode =
    provider === "cloud" && !isOnline ? "local" : provider;

  const active: SharedChatResult = activeProvider === "cloud" ? cloud : local;

  return {
    provider,
    activeProvider,
    setProvider,
    ...active,
    mode: local.mode,
    hasOpenRouterKey: cloud.hasOpenRouterKey,
    cloudModelId: cloud.modelId,
    setCloudModelId: cloud.setModelId,
    refreshLocalModel: local.refreshLocalModel,
  };
}
