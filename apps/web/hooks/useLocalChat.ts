"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { streamText } from "ai";
import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import { useWebLLM } from "@/components/contexts/WebLLMContext";

/** Token-usage summary for a single assistant message bubble. */
interface MessageUsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
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

function updateMessageText(
  message: UIMessage,
  text: string,
  status?: "success" | "streaming",
): UIMessage {
  return {
    ...message,
    text,
    parts: text ? [{ type: "text", text }] : [],
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
  isReady: boolean;
  usageByMessageKey: Record<string, MessageUsageSummary>;
}

export function useLocalChat(threadId: string | null): LocalChatResult {
  const { model, engineState } = useWebLLM();
  const [draftMessages, setDraftMessages] = useState<UIMessage[]>([]);
  const [draftUsageByKey, setDraftUsageByKey] = useState<
    Record<string, MessageUsageSummary>
  >({});
  const [isStreaming, setIsStreaming] = useState(false);
  const orderRef = useRef(0);

  const saveLocalMessages = useMutation(api.chat.saveLocalMessages);
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

        let accumulated = "";
        for await (const delta of result.textStream) {
          accumulated += delta;
          setDraftMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.key === assistantMessage.key
                ? updateMessageText(message, accumulated)
                : message,
            ),
          );
        }

        // Capture token usage from the completed stream
        const totalUsage = await result.totalUsage;
        const inputTokens = totalUsage.inputTokens ?? 0;
        const outputTokens = totalUsage.outputTokens ?? 0;
        const hasUsage = inputTokens > 0 || outputTokens > 0;

        if (hasUsage) {
          const summary: MessageUsageSummary = {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          };
          setDraftUsageByKey((prev) => ({
            ...prev,
            [assistantMessage.key]: summary,
          }));
        }

        setDraftMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.key === assistantMessage.key
              ? updateMessageText(message, accumulated, "success")
              : message,
          ),
        );

        if (threadId && accumulated) {
          const usageForSave = hasUsage
            ? {
                promptTokens: inputTokens,
                completionTokens: outputTokens,
                totalTokens: inputTokens + outputTokens,
              }
            : undefined;

          await saveLocalMessages({
            threadId,
            userText: text,
            assistantText: accumulated,
            usage: usageForSave,
          });
          setDraftMessages([]);
          setDraftUsageByKey({});
        }
      } catch (error) {
        const errorText =
          error instanceof Error ? error.message : "Something went wrong";
        setDraftMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.key === assistantMessage.key
              ? updateMessageText(message, `Error: ${errorText}`, "success")
              : message,
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

  return {
    messages,
    sendMessage,
    isStreaming,
    isReady: engineState === "ready" && model !== null,
    usageByMessageKey,
  };
}
