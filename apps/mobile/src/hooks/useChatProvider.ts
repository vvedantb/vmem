import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-expo";
import { useUIMessages } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import { streamText } from "ai";
import { useIsOnline } from "@/providers/NetworkProvider";
import { getLocalModel } from "@/services/llm-context";
import {
  checkModelStatus,
  getActiveModelIdOrDefault,
} from "@/services/model-manager";

type ChatMode = "ready" | "no_model";

function normalizeChatInput(text: string | undefined): string {
  return typeof text === "string" ? text.trim() : "";
}

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

const SYSTEM_PROMPT = [
  "You are vmem, a memory assistant that helps users store, search, and recall their personal memories.",
  "You are currently running locally on the user's device with limited capabilities.",
  "You cannot search memories right now. Have a helpful general conversation.",
  "Be concise and helpful.",
].join(" ");

export function useChatProvider() {
  const { user, isLoaded } = useUser();
  const isOnline = useIsOnline();
  const [mode, setMode] = useState<ChatMode>("no_model");
  const [localMessages, setLocalMessages] = useState<UIMessage[]>([]);
  const [localStreaming, setLocalStreaming] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const orderRef = useRef(0);

  const [threadId, setThreadId] = useState<string | null>(null);
  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const saveLocalMessages = useMutation(api.chat.saveLocalMessages);

  // Load or create thread when online and authenticated
  useEffect(() => {
    if (!isOnline || !isLoaded || !user) {
      setThreadId(null);
      return;
    }

    void getOrCreateThread()
      .then((id) => setThreadId(id))
      .catch((error) => {
        console.error("Failed to load chat thread:", error);
      });
  }, [isOnline, isLoaded, user, getOrCreateThread]);

  // Check local model readiness
  useEffect(() => {
    getActiveModelIdOrDefault()
      .then((modelId) => checkModelStatus(modelId))
      .then((status) => {
        if (status.state === "ready") {
          setMode("ready");
          getLocalModel().then((model) => {
            setLocalReady(model !== null);
          });
        } else {
          setMode("no_model");
        }
      });
  }, []);

  // Show persisted messages from Convex when thread is available
  const { results: persistedMessages } = useUIMessages(
    api.chat.listThreadMessages,
    isOnline && threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const sendLocalMessage = useCallback(
    async (text: string) => {
      if (localStreaming) return;

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

      setLocalMessages((prev) => [...prev, userMsg, assistantMsg]);
      setLocalStreaming(true);

      try {
        const model = await getLocalModel();
        if (!model) {
          setLocalMessages((prev) =>
            prev.map((m) =>
              m.key === assistantMsg.key
                ? updateMessageText(
                    m,
                    "Model not ready. Please download it in Settings.",
                    "success",
                  )
                : m,
            ),
          );
          setLocalStreaming(false);
          return;
        }

        const conversationHistory = localMessages.flatMap((message) => {
          if (message.status !== "success") {
            return [];
          }

          if (message.role !== "user" && message.role !== "assistant") {
            return [];
          }

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
          setLocalMessages((prev) =>
            prev.map((m) =>
              m.key === assistantMsg.key ? updateMessageText(m, current) : m,
            ),
          );
        }

        setLocalMessages((prev) =>
          prev.map((m) =>
            m.key === assistantMsg.key
              ? updateMessageText(m, accumulated, "success")
              : m,
          ),
        );

        // Persist to Convex when online
        if (threadId && accumulated) {
          await saveLocalMessages({
            threadId,
            userText: text,
            assistantText: accumulated,
          });
        }
      } catch (e) {
        const errorText =
          e instanceof Error ? e.message : "Something went wrong";
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.key === assistantMsg.key
              ? updateMessageText(m, `Error: ${errorText}`, "success")
              : m,
          ),
        );
      } finally {
        setLocalStreaming(false);
      }
    },
    [localStreaming, localMessages, threadId, saveLocalMessages],
  );

  const sendMessage = useCallback(
    async (text: string | undefined) => {
      const prompt = normalizeChatInput(text);
      if (!prompt) return;

      if (mode === "ready") {
        await sendLocalMessage(prompt);
      }
    },
    [mode, sendLocalMessage],
  );

  // Combine persisted + local draft messages
  const messages =
    isOnline && persistedMessages.length > 0
      ? persistedMessages.concat(localMessages)
      : localMessages;
  const isStreaming = localStreaming;
  const isReady = mode === "ready" && localReady;

  return {
    messages,
    sendMessage,
    isStreaming,
    isReady,
    mode,
  };
}
