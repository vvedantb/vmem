import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-expo";
import {
  useUIMessages,
  optimisticallySendMessage,
} from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import { streamText } from "ai";
import { useIsOnline } from "@/providers/NetworkProvider";
import { getLocalModel } from "@/services/llm-context";
import { checkModelStatus } from "@/services/model-manager";

type ChatMode = "online" | "offline" | "offline_no_model";

function normalizeChatInput(text: string | undefined): string {
  return typeof text === "string" ? text.trim() : "";
}

function makeOfflineMessage(
  role: "user" | "assistant",
  text: string,
  status: "success" | "streaming",
  order: number,
): UIMessage {
  const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  "You are currently running offline on the user's device with limited capabilities.",
  "You cannot search memories right now. Have a helpful general conversation.",
  "Be concise and helpful.",
].join(" ");

export function useChatProvider() {
  const { user, isLoaded } = useUser();
  const isOnline = useIsOnline();
  const [mode, setMode] = useState<ChatMode>("online");
  const [offlineMessages, setOfflineMessages] = useState<UIMessage[]>([]);
  const [offlineStreaming, setOfflineStreaming] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const orderRef = useRef(0);

  const [threadId, setThreadId] = useState<string | null>(null);
  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const sendOnlineMessage = useMutation(
    api.chat.initiateStreaming,
  ).withOptimisticUpdate((store, args) => {
    optimisticallySendMessage(api.chat.listThreadMessages)(store, args);
  });

  useEffect(() => {
    if (!isOnline) {
      setThreadId(null);
      return;
    }

    if (!isLoaded || !user) {
      return;
    }

    void getOrCreateThread()
      .then((id) => setThreadId(id))
      .catch((error) => {
        console.error("Failed to load chat thread:", error);
      });
  }, [isOnline, isLoaded, user, getOrCreateThread]);

  useEffect(() => {
    if (isOnline) {
      setMode("online");
      return;
    }
    checkModelStatus().then((status) => {
      if (status.state === "ready") {
        setMode("offline");
        getLocalModel().then((model) => {
          setOfflineReady(model !== null);
        });
      } else {
        setMode("offline_no_model");
      }
    });
  }, [isOnline]);

  const { results: onlineMessages } = useUIMessages(
    api.chat.listThreadMessages,
    isOnline && threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const onlineStreaming = onlineMessages.some(
    (m) => m.role === "assistant" && m.status === "streaming",
  );

  const sendOfflineMessage = useCallback(
    async (text: string) => {
      if (offlineStreaming) return;

      const userMsg = makeOfflineMessage(
        "user",
        text,
        "success",
        orderRef.current++,
      );
      const assistantMsg = makeOfflineMessage(
        "assistant",
        "",
        "streaming",
        orderRef.current++,
      );

      setOfflineMessages((prev) => [...prev, userMsg, assistantMsg]);
      setOfflineStreaming(true);

      try {
        const model = await getLocalModel();
        if (!model) {
          setOfflineMessages((prev) =>
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
          setOfflineStreaming(false);
          return;
        }

        const conversationHistory = offlineMessages.flatMap((message) => {
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
          setOfflineMessages((prev) =>
            prev.map((m) =>
              m.key === assistantMsg.key ? updateMessageText(m, current) : m,
            ),
          );
        }

        setOfflineMessages((prev) =>
          prev.map((m) =>
            m.key === assistantMsg.key
              ? updateMessageText(m, accumulated, "success")
              : m,
          ),
        );
      } catch (e) {
        const errorText =
          e instanceof Error ? e.message : "Something went wrong";
        setOfflineMessages((prev) =>
          prev.map((m) =>
            m.key === assistantMsg.key
              ? updateMessageText(m, `Error: ${errorText}`, "success")
              : m,
          ),
        );
      } finally {
        setOfflineStreaming(false);
      }
    },
    [offlineStreaming, offlineMessages],
  );

  const sendMessage = useCallback(
    async (text: string | undefined) => {
      const prompt = normalizeChatInput(text);
      if (!prompt) return;

      if (mode === "online" && threadId) {
        await sendOnlineMessage({ prompt, threadId });
      } else if (mode === "offline") {
        await sendOfflineMessage(prompt);
      }
    },
    [mode, threadId, sendOnlineMessage, sendOfflineMessage],
  );

  const messages = mode === "online" ? onlineMessages : offlineMessages;
  const isStreaming = mode === "online" ? onlineStreaming : offlineStreaming;
  const isReady =
    mode === "online"
      ? threadId !== null
      : mode === "offline"
        ? offlineReady
        : false;

  return {
    messages,
    sendMessage,
    isStreaming,
    isReady,
    mode,
  };
}
