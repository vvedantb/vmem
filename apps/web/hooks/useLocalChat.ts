"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { streamText } from "ai";
import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import { useWebLLM } from "@/components/contexts/WebLLMContext";

/** Token-usage summary for a single assistant message bubble. */
export interface MessageUsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  /** Output tokens per second (local inference speed). Present for local messages only. */
  tokensPerSecond?: number;
}

const SYSTEM_PROMPT = [
  "You are vmem, a memory assistant that helps users store, search, and recall their personal memories.",
  "You are currently running locally in the user's browser with limited capabilities.",
  "You cannot search memories right now. Have a helpful general conversation.",
  "Be concise and helpful.",
].join(" ");

function makeLocalMessage(
  role: "user" | "assistant",
  text: string,
  status: "success" | "streaming",
  order: number,
): UIMessage {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    key: id,
    role,
    text,
    status,
    parts: text ? [{ type: "text", text }] : [],
    order,
    stepOrder: 0,
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

interface LocalChatResult {
  messages: UIMessage[];
  sendMessage: (text: string) => Promise<void>;
  isStreaming: boolean;
  /** Thread loaded (may still need a model to send messages). */
  isThreadReady: boolean;
  /** Thread loaded AND WebLLM engine ready. */
  isReady: boolean;
  usageByMessageKey: Record<string, MessageUsageSummary>;
}

export function useLocalChat(): LocalChatResult {
  const { model, engineState } = useWebLLM();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draftMessages, setDraftMessages] = useState<UIMessage[]>([]);
  const [draftUsageByKey, setDraftUsageByKey] = useState<
    Record<string, MessageUsageSummary>
  >({});
  const [isStreaming, setIsStreaming] = useState(false);
  const orderRef = useRef(0);

  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const saveLocalMessages = useMutation(api.chat.saveLocalMessages);

  // Load or create the chat thread on mount
  useEffect(() => {
    getOrCreateThread()
      .then((id) => setThreadId(id))
      .catch((error) => {
        console.error("Failed to load chat thread:", error);
      });
  }, [getOrCreateThread]);

  const persistedUsageByKey: Record<string, MessageUsageSummary> =
    useQuery(
      api.chat.getThreadMessageUsage,
      threadId ? { threadId } : "skip",
    ) ?? {};
  const { results: persistedMessages } = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  useEffect(() => {
    setDraftMessages([]);
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
      if (!text.trim() || isStreaming || !model) {
        return;
      }

      const startingOrder = Math.max(
        orderRef.current,
        getHighestOrder(messages) + 1,
      );
      orderRef.current = startingOrder + 2;

      const userMessage = makeLocalMessage(
        "user",
        text,
        "success",
        startingOrder,
      );
      const assistantMessage = makeLocalMessage(
        "assistant",
        "",
        "streaming",
        startingOrder + 1,
      );

      setDraftMessages([userMessage, assistantMessage]);
      setIsStreaming(true);

      try {
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
          system: SYSTEM_PROMPT,
          messages: [...conversationHistory, { role: "user", content: text }],
        });

        let accumulatedText = "";
        let accumulatedReasoning = "";
        let outputTokenCount = 0;
        const streamStartTime = performance.now();

        for await (const part of result.fullStream) {
          if (part.type === "reasoning-delta") {
            accumulatedReasoning += part.text;
            setDraftMessages((cur) =>
              cur.map((m) =>
                m.key === assistantMessage.key
                  ? updateMessage(m, accumulatedText, accumulatedReasoning)
                  : m,
              ),
            );
          } else if (part.type === "text-delta") {
            accumulatedText += part.text;
            outputTokenCount++;
            setDraftMessages((cur) =>
              cur.map((m) =>
                m.key === assistantMessage.key
                  ? updateMessage(m, accumulatedText, accumulatedReasoning)
                  : m,
              ),
            );
          }
        }

        const streamDurationSec = (performance.now() - streamStartTime) / 1000;

        // Capture token usage from the completed stream
        const totalUsage = await result.totalUsage;
        const inputTokens = totalUsage.inputTokens ?? 0;
        const outputTokens = totalUsage.outputTokens ?? 0;
        // Use SDK-reported output tokens when available, fall back to delta count
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
              ? updateMessage(
                  m,
                  accumulatedText,
                  accumulatedReasoning,
                  "success",
                )
              : m,
          ),
        );

        if (threadId && accumulatedText) {
          await saveLocalMessages({
            threadId,
            userText: text,
            assistantText: accumulatedText,
            usage: {
              promptTokens: inputTokens,
              completionTokens: finalOutputTokens,
              totalTokens: inputTokens + finalOutputTokens,
            },
          });
          setDraftMessages([]);
          setDraftUsageByKey({});
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
    [isStreaming, messages, model, saveLocalMessages, threadId],
  );

  const usageByMessageKey: Record<string, MessageUsageSummary> = {
    ...persistedUsageByKey,
    ...draftUsageByKey,
  };

  const isThreadReady = threadId !== null;
  const isModelReady = engineState === "ready" && model !== null;

  return {
    messages,
    sendMessage,
    isStreaming,
    isThreadReady,
    isReady: isThreadReady && isModelReady,
    usageByMessageKey,
  };
}
