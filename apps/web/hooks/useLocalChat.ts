"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { streamText } from "ai";
import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import {
  VMEM_LOCAL_CHAT_CORE,
  buildMemoryRagAddition,
  composeSystemPrompt,
} from "@vmem/backend/memoryRagPrompt";
import { useLocalLLM } from "@/components/contexts/LocalLLMContext";

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

export interface ChatMemoryRef {
  id: string;
  title: string;
}

const RETRIEVE_LIMIT = 8;

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

/**
 * Parse <think>...</think> tags from raw text.
 * Returns { reasoning, text, isThinking } where:
 * - reasoning: content inside <think> tags (accumulated)
 * - text: content outside <think> tags
 * - isThinking: true if currently inside an unclosed <think> tag
 */
function parseThinkTags(raw: string): {
  reasoning: string;
  text: string;
  isThinking: boolean;
} {
  let reasoning = "";
  let text = "";
  let isThinking = false;
  let cursor = 0;

  while (cursor < raw.length) {
    if (!isThinking) {
      const thinkStart = raw.indexOf("<think>", cursor);
      if (thinkStart === -1) {
        text += raw.slice(cursor);
        break;
      }
      text += raw.slice(cursor, thinkStart);
      cursor = thinkStart + 7; // length of "<think>"
      isThinking = true;
    } else {
      const thinkEnd = raw.indexOf("</think>", cursor);
      if (thinkEnd === -1) {
        // Still inside thinking, accumulate but don't add to reasoning yet
        reasoning += raw.slice(cursor);
        break;
      }
      reasoning += raw.slice(cursor, thinkEnd);
      cursor = thinkEnd + 8; // length of "</think>"
      isThinking = false;
    }
  }

  return { reasoning: reasoning.trim(), text: text.trim(), isThinking };
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
  memoryRefsByMessageKey: Record<string, ChatMemoryRef[]>;
}

export function useLocalChat(): LocalChatResult {
  const { model, engineState } = useLocalLLM();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draftMessages, setDraftMessages] = useState<UIMessage[]>([]);
  const [draftUsageByKey, setDraftUsageByKey] = useState<
    Record<string, MessageUsageSummary>
  >({});
  const [draftMemoryRefsByKey, setDraftMemoryRefsByKey] = useState<
    Record<string, ChatMemoryRef[]>
  >({});
  const [isStreaming, setIsStreaming] = useState(false);
  const orderRef = useRef(0);

  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const saveLocalMessages = useMutation(api.chat.saveLocalMessages);
  const retrieveMemories = useAction(api.memoryApi.retrieveMemories);

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
  const persistedMemoryRefsByKey: Record<string, ChatMemoryRef[]> =
    useQuery(
      api.chat.getThreadMessageMemoryRefs,
      threadId ? { threadId } : "skip",
    ) ?? {};
  const { results: persistedMessages } = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
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
      if (!text.trim() || isStreaming || !model) {
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

      setDraftMessages([userMessage, assistantMessage]);
      setIsStreaming(true);

      try {
        let memoryRefs: ChatMemoryRef[] = [];
        let systemPrompt = VMEM_LOCAL_CHAT_CORE;

        try {
          const retrieved = await retrieveMemories({
            query: text,
            limit: RETRIEVE_LIMIT,
          });
          memoryRefs = retrieved.map((m) => ({ id: m.id, title: m.title }));
          const addition = buildMemoryRagAddition(
            retrieved.map((m) => ({
              id: m.id,
              title: m.title,
              content: m.content,
              trace: { reason: m.trace.reason },
            })),
          );
          systemPrompt = composeSystemPrompt(VMEM_LOCAL_CHAT_CORE, addition);
        } catch (retrieveError) {
          console.error("retrieveMemories failed:", retrieveError);
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
        const streamStartTime = performance.now();

        for await (const part of result.fullStream) {
          if (part.type === "reasoning-delta") {
            // Native reasoning support (e.g., from providers that support it directly)
            rawAccumulated += part.text;
            const parsed = parseThinkTags(rawAccumulated);
            setDraftMessages((cur) =>
              cur.map((m) =>
                m.key === assistantMessage.key
                  ? updateMessage(m, parsed.text, parsed.reasoning)
                  : m,
              ),
            );
          } else if (part.type === "text-delta") {
            rawAccumulated += part.text;
            outputTokenCount++;
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
        }

        // Final parse to get clean text/reasoning
        const finalParsed = parseThinkTags(rawAccumulated);

        // If model only output thinking (no response text), use thinking as the response
        const displayText = finalParsed.text || finalParsed.reasoning;
        const displayReasoning = finalParsed.text ? finalParsed.reasoning : "";

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
              ? updateMessage(m, displayText, displayReasoning, "success")
              : m,
          ),
        );

        if (threadId && displayText) {
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
      isStreaming,
      messages,
      model,
      retrieveMemories,
      saveLocalMessages,
      threadId,
    ],
  );

  const usageByMessageKey: Record<string, MessageUsageSummary> = {
    ...persistedUsageByKey,
    ...draftUsageByKey,
  };

  const memoryRefsByMessageKey: Record<string, ChatMemoryRef[]> = {
    ...persistedMemoryRefsByKey,
    ...draftMemoryRefsByKey,
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
    memoryRefsByMessageKey,
  };
}
