import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-expo";
import { streamText } from "ai";
import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { VMEM_LOCAL_CHAT_CORE, parseThinkTags } from "@vmem/shared";
import { useIsOnline } from "@/providers/NetworkProvider";
import { getLocalModel } from "@/services/llm-context";
import {
  checkModelStatus,
  getActiveModelIdOrDefault,
} from "@/services/model-manager";
import {
  buildGroundedPrompt,
  type ChatMemoryRef,
} from "@/lib/memory-grounding";

export type { ChatMemoryRef };

/** Token-usage summary for a single assistant bubble (persisted shape + local-only speed). */
export type MessageUsageSummary = FunctionReturnType<
  typeof api.chat.getThreadMessageUsage
>[string] & {
  /** Output tokens per second (local inference speed). Present for local messages only. */
  tokensPerSecond?: number;
};

/**
 * Local chat readiness, factoring in connectivity:
 * - "ready"            online + local model loaded
 * - "no_model"         online, no downloaded/loaded model
 * - "offline"          offline but the model works (no retrieval, no persistence)
 * - "offline_no_model" offline and nothing to run
 */
export type LocalChatMode =
  | "ready"
  | "no_model"
  | "offline"
  | "offline_no_model";

function makeLocalMessage(
  threadId: string | null,
  role: "user" | "assistant",
  text: string,
  status: "success" | "streaming",
  order: number,
): UIMessage {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stepOrder = 0;
  const key =
    threadId !== null
      ? `${threadId}-${String(order)}-${String(stepOrder)}`
      : id;
  return {
    id,
    key,
    role,
    text,
    status,
    parts: text ? [{ type: "text", text }] : [],
    order,
    stepOrder,
    agentName: "vmem-local",
    _creationTime: Date.now(),
  };
}

/** Build parts array from accumulated text + reasoning. */
function buildParts(text: string, reasoning: string): UIMessage["parts"] {
  const parts: UIMessage["parts"] = [];
  if (reasoning) {
    parts.push({ type: "reasoning", text: reasoning, providerMetadata: {} });
  }
  if (text) {
    parts.push({ type: "text", text });
  }
  return parts;
}

function updateMessage(
  message: UIMessage,
  text: string,
  reasoning: string,
  status?: "success" | "streaming",
): UIMessage {
  return {
    ...message,
    text,
    parts: buildParts(text, reasoning),
    status: status ?? message.status,
  };
}

function getHighestOrder(messages: UIMessage[]): number {
  return messages.reduce(
    (highestOrder, message) =>
      message.order > highestOrder ? message.order : highestOrder,
    -1,
  );
}

export interface LocalChatResult {
  messages: UIMessage[];
  sendMessage: (text: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  isStreaming: boolean;
  isClearing: boolean;
  isThreadReady: boolean;
  isReady: boolean;
  mode: LocalChatMode;
  usageByMessageKey: Record<string, MessageUsageSummary>;
  memoryRefsByMessageKey: Record<string, ChatMemoryRef[]>;
  /** Re-check on-disk model status + (re)load it. Call after downloads/selection. */
  refreshLocalModel: () => Promise<void>;
}

export function useLocalChat(): LocalChatResult {
  const { user, isLoaded } = useUser();
  const isOnline = useIsOnline();
  const [modelReady, setModelReady] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draftMessages, setDraftMessages] = useState<UIMessage[]>([]);
  const [draftUsageByKey, setDraftUsageByKey] = useState<
    Record<string, MessageUsageSummary>
  >({});
  const [draftMemoryRefsByKey, setDraftMemoryRefsByKey] = useState<
    Record<string, ChatMemoryRef[]>
  >({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const orderRef = useRef(0);

  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const saveLocalMessages = useMutation(api.chat.saveLocalMessages);
  const clearChatHistory = useMutation(api.chat.clearChatHistory);
  const retrieveMemories = useAction(api.memoryApi.retrieveMemories);
  // Personal scope ({}): mobile has no team workspaces.
  const mySkills = useQuery(api.skills.listMy, {}) ?? [];

  const refreshLocalModel = useCallback(async () => {
    const modelId = await getActiveModelIdOrDefault();
    const status = await checkModelStatus(modelId);
    if (status.state !== "ready") {
      setModelReady(false);
      return;
    }
    const model = await getLocalModel();
    setModelReady(model !== null);
  }, []);

  useEffect(() => {
    void refreshLocalModel();
  }, [refreshLocalModel]);

  // Load or create the chat thread once signed in and online.
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

  const persistedUsageByKey: Record<string, MessageUsageSummary> =
    useQuery(
      api.chat.getThreadMessageUsage,
      isOnline && threadId ? { threadId } : "skip",
    ) ?? {};
  const persistedMemoryRefsByKey: Record<string, ChatMemoryRef[]> =
    useQuery(
      api.chat.getThreadMessageMemoryRefs,
      isOnline && threadId ? { threadId } : "skip",
    ) ?? {};
  const { results: persistedMessages } = useUIMessages(
    api.chat.listThreadMessages,
    isOnline && threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  useEffect(() => {
    setDraftMessages([]);
    setDraftMemoryRefsByKey({});
    orderRef.current = 0;
  }, [threadId]);

  useEffect(() => {
    if (draftMessages.length > 0 || isStreaming) {
      return;
    }
    orderRef.current = Math.max(
      orderRef.current,
      getHighestOrder(persistedMessages) + 1,
    );
  }, [draftMessages.length, isStreaming, persistedMessages]);

  const messages = persistedMessages.concat(draftMessages);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming || !modelReady) {
        return;
      }

      const startingOrder = Math.max(
        orderRef.current,
        getHighestOrder(messages) + 1,
      );
      orderRef.current = startingOrder + 2;

      const userMessage = makeLocalMessage(
        threadId,
        "user",
        text,
        "success",
        startingOrder,
      );
      const assistantMessage = makeLocalMessage(
        threadId,
        "assistant",
        "",
        "streaming",
        startingOrder + 1,
      );

      setDraftMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      try {
        const model = await getLocalModel();
        if (!model) {
          setDraftMessages((cur) =>
            cur.map((m) =>
              m.key === assistantMessage.key
                ? updateMessage(
                    m,
                    "Model not ready. Please download it in Settings.",
                    "",
                    "success",
                  )
                : m,
            ),
          );
          return;
        }

        // Memory grounding needs the backend; offline falls back to the core prompt.
        let memoryRefs: ChatMemoryRef[] = [];
        let systemPrompt = VMEM_LOCAL_CHAT_CORE;
        if (isOnline) {
          const grounded = await buildGroundedPrompt({
            core: VMEM_LOCAL_CHAT_CORE,
            query: text,
            skills: mySkills.map((skill) => ({
              name: skill.name,
              description: skill.description,
              instructions: skill.instructions,
              enabled: skill.enabled,
            })),
            retrieve: retrieveMemories,
          });
          memoryRefs = grounded.memoryRefs;
          systemPrompt = grounded.systemPrompt;
        }

        setDraftMemoryRefsByKey((prev) => ({
          ...prev,
          [assistantMessage.key]: memoryRefs,
        }));

        const conversationHistory = messages.flatMap((message) => {
          if (message.status !== "success") {
            return [];
          }
          if (message.role !== "user" && message.role !== "assistant") {
            return [];
          }
          return [{ role: message.role, content: message.text }];
        });

        const result = streamText({
          model,
          system: systemPrompt,
          messages: [...conversationHistory, { role: "user", content: text }],
        });

        let rawAccumulated = "";
        let outputTokenCount = 0;
        const streamStartTime = Date.now();

        for await (const part of result.fullStream) {
          if (part.type === "reasoning-delta") {
            rawAccumulated += part.text;
          } else if (part.type === "text-delta") {
            rawAccumulated += part.text;
            outputTokenCount++;
          } else {
            continue;
          }
          // Parse <think> tags from raw text (Qwen 3, DeepSeek, etc.)
          const parsed = parseThinkTags(rawAccumulated);
          setDraftMessages((cur) =>
            cur.map((m) =>
              m.key === assistantMessage.key
                ? updateMessage(m, parsed.text, parsed.reasoning)
                : m,
            ),
          );
        }

        const finalParsed = parseThinkTags(rawAccumulated);

        // If the model only output thinking, surface it as the response text.
        const displayText = finalParsed.text || finalParsed.reasoning;
        const displayReasoning = finalParsed.text ? finalParsed.reasoning : "";

        const streamDurationSec = (Date.now() - streamStartTime) / 1000;

        const totalUsage = await result.totalUsage;
        const inputTokens = totalUsage.inputTokens ?? 0;
        const outputTokens = totalUsage.outputTokens ?? 0;
        const finalOutputTokens =
          outputTokens > 0 ? outputTokens : outputTokenCount;
        const tokensPerSecond =
          streamDurationSec > 0 ? finalOutputTokens / streamDurationSec : 0;

        const summary: MessageUsageSummary = {
          inputTokens,
          outputTokens: finalOutputTokens,
          totalTokens: inputTokens + finalOutputTokens,
          reasoningTokens: 0,
          cachedInputTokens: 0,
          tokensPerSecond,
        };
        setDraftUsageByKey((prev) => ({
          ...prev,
          [assistantMessage.key]: summary,
        }));

        setDraftMessages((cur) =>
          cur.map((m) =>
            m.key === assistantMessage.key
              ? updateMessage(m, displayText, displayReasoning, "success")
              : m,
          ),
        );

        if (isOnline && threadId && displayText) {
          const hasRefs = memoryRefs.length > 0;
          await saveLocalMessages({
            threadId,
            userText: text,
            assistantText: displayText,
            usage: {
              promptTokens: inputTokens,
              completionTokens: finalOutputTokens,
              totalTokens: inputTokens + finalOutputTokens,
            },
            ...(hasRefs
              ? {
                  memoryRefs,
                  assistantOrder: assistantMessage.order,
                  assistantStepOrder: assistantMessage.stepOrder,
                }
              : {}),
          });
          setDraftMessages([]);
          setDraftUsageByKey({});
          setDraftMemoryRefsByKey({});
        }
      } catch (error) {
        const errorText =
          error instanceof Error ? error.message : "Something went wrong";
        setDraftMessages((cur) =>
          cur.map((m) =>
            m.key === assistantMessage.key
              ? updateMessage(m, `Error: ${errorText}`, "", "success")
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [
      isOnline,
      isStreaming,
      messages,
      modelReady,
      retrieveMemories,
      saveLocalMessages,
      threadId,
      mySkills,
    ],
  );

  const clearHistory = useCallback(async () => {
    if (!threadId || isStreaming || isClearing) {
      return;
    }
    setIsClearing(true);
    try {
      const newThreadId = await clearChatHistory({ threadId });
      setDraftUsageByKey({});
      setThreadId(newThreadId);
    } finally {
      setIsClearing(false);
    }
  }, [clearChatHistory, isClearing, isStreaming, threadId]);

  const usageByMessageKey: Record<string, MessageUsageSummary> = {
    ...persistedUsageByKey,
    ...draftUsageByKey,
  };

  const memoryRefsByMessageKey: Record<string, ChatMemoryRef[]> = {
    ...persistedMemoryRefsByKey,
    ...draftMemoryRefsByKey,
  };

  const mode: LocalChatMode = isOnline
    ? modelReady
      ? "ready"
      : "no_model"
    : modelReady
      ? "offline"
      : "offline_no_model";

  return {
    messages,
    sendMessage,
    clearHistory,
    isStreaming,
    isClearing,
    isThreadReady: threadId !== null,
    isReady: modelReady,
    mode,
    usageByMessageKey,
    memoryRefsByMessageKey,
    refreshLocalModel,
  };
}
