/**
 * Hook for local LLM chat via WebLLM (in-browser inference).
 * Mirrors mobile's sendOfflineMessage pattern from useChatProvider.ts.
 *
 * Messages are managed in React state during streaming, then persisted
 * to Convex after completion so they show up in the shared thread.
 */
"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { streamText } from "ai";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import { useWebLLM } from "@/components/contexts/WebLLMContext";

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
    _creationTime: Date.now(),
  };
}

function updateMessageText(
  msg: UIMessage,
  newText: string,
  newStatus?: "success" | "streaming",
): UIMessage {
  return {
    ...msg,
    text: newText,
    parts: newText ? [{ type: "text", text: newText }] : [],
    status: newStatus ?? msg.status,
  };
}

interface LocalChatResult {
  messages: UIMessage[];
  sendMessage: (text: string) => Promise<void>;
  isStreaming: boolean;
  isReady: boolean;
}

export function useLocalChat(threadId: string | null): LocalChatResult {
  const { model, engineState } = useWebLLM();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const orderRef = useRef(0);

  const saveLocalMessages = useMutation(api.chat.saveLocalMessages);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming || !model) return;

      const userMsg = makeLocalMessage(
        "user",
        text,
        "success",
        orderRef.current++,
      );
      const assistantMsg = makeLocalMessage(
        "assistant",
        "",
        "streaming",
        orderRef.current++,
      );

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      try {
        // Build conversation history from existing messages
        const conversationHistory = messages.flatMap((message) => {
          if (message.status !== "success") return [];
          if (message.role !== "user" && message.role !== "assistant")
            return [];
          return [{ role: message.role, content: message.text }];
        });

        const { textStream } = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages: [...conversationHistory, { role: "user", content: text }],
        });

        let accumulated = "";
        for await (const delta of textStream) {
          accumulated += delta;
          const current = accumulated;
          setMessages((prev) =>
            prev.map((m) =>
              m.key === assistantMsg.key ? updateMessageText(m, current) : m,
            ),
          );
        }

        // Finalize the message
        setMessages((prev) =>
          prev.map((m) =>
            m.key === assistantMsg.key
              ? updateMessageText(m, accumulated, "success")
              : m,
          ),
        );

        // Persist to Convex for thread history (fire-and-forget)
        if (threadId && accumulated) {
          saveLocalMessages({
            threadId,
            userText: text,
            assistantText: accumulated,
          }).catch((err) => {
            console.error("Failed to persist local messages:", err);
          });
        }
      } catch (e) {
        const errorText =
          e instanceof Error ? e.message : "Something went wrong";
        setMessages((prev) =>
          prev.map((m) =>
            m.key === assistantMsg.key
              ? updateMessageText(m, `Error: ${errorText}`, "success")
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, model, messages, threadId, saveLocalMessages],
  );

  return {
    messages,
    sendMessage,
    isStreaming,
    isReady: engineState === "ready" && model !== null,
  };
}
