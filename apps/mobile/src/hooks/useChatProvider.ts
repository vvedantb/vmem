import { useState, useEffect, useCallback, useRef } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-expo";
import { useUIMessages } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import {
  VMEM_LOCAL_CHAT_CORE,
  buildLocalChatSystemPrompt,
} from "@vmem/backend/memoryRagPrompt";
import { streamText } from "ai";
import { useIsOnline } from "@/providers/NetworkProvider";
import { getLocalModel } from "@/services/llm-context";
import {
  checkModelStatus,
  getActiveModelIdOrDefault,
} from "@/services/model-manager";

type ChatMode = "ready" | "no_model" | "offline" | "offline_no_model";

export interface ChatMemoryRef {
  id: string;
  title: string;
}

const RETRIEVE_LIMIT = 8;

function normalizeChatInput(text: string | undefined): string {
  return typeof text === "string" ? text.trim() : "";
}

function getHighestOrder(messages: UIMessage[]): number {
  return messages.reduce(
    (highestOrder, message) =>
      message.order > highestOrder ? message.order : highestOrder,
    -1,
  );
}

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

export function useChatProvider() {
  const { user, isLoaded } = useUser();
  const isOnline = useIsOnline();
  const [mode, setMode] = useState<ChatMode>("no_model");
  const [localMessages, setLocalMessages] = useState<UIMessage[]>([]);
  const [localStreaming, setLocalStreaming] = useState(false);
  const [localReady, setLocalReady] = useState(false);
  const orderRef = useRef(0);
  const [draftMemoryRefsByKey, setDraftMemoryRefsByKey] = useState<
    Record<string, ChatMemoryRef[]>
  >({});

  const [threadId, setThreadId] = useState<string | null>(null);
  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const saveLocalMessages = useMutation(api.chat.saveLocalMessages);
  const retrieveMemories = useAction(api.memoryApi.retrieveMemories);
  const mySkills = useQuery(api.skills.listMy) ?? [];

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

  useEffect(() => {
    setLocalMessages([]);
    setDraftMemoryRefsByKey({});
    orderRef.current = 0;
  }, [threadId]);

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

  const { results: persistedMessages } = useUIMessages(
    api.chat.listThreadMessages,
    isOnline && threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const persistedMemoryRefsByKey: Record<string, ChatMemoryRef[]> =
    useQuery(
      api.chat.getThreadMessageMemoryRefs,
      isOnline && threadId ? { threadId } : "skip",
    ) ?? {};

  useEffect(() => {
    if (localMessages.length > 0 || localStreaming) {
      return;
    }

    orderRef.current = Math.max(
      orderRef.current,
      getHighestOrder(persistedMessages) + 1,
    );
  }, [localMessages.length, localStreaming, persistedMessages]);

  const priorForOrdering: UIMessage[] =
    isOnline && persistedMessages.length > 0
      ? persistedMessages.concat(localMessages)
      : localMessages;

  const sendLocalMessage = useCallback(
    async (text: string) => {
      if (localStreaming) return;

      const startingOrder = Math.max(
        orderRef.current,
        getHighestOrder(priorForOrdering) + 1,
      );
      orderRef.current = startingOrder + 2;

      const userMsg = makeLocalMessage(
        threadId,
        "user",
        text,
        "success",
        startingOrder,
      );
      const assistantMsg = makeLocalMessage(
        threadId,
        "assistant",
        "",
        "streaming",
        startingOrder + 1,
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

        let memoryRefs: ChatMemoryRef[] = [];
        let systemPrompt = VMEM_LOCAL_CHAT_CORE;

        if (isOnline) {
          try {
            const retrieved = await retrieveMemories({
              query: text,
              limit: RETRIEVE_LIMIT,
            });
            memoryRefs = retrieved.memories.map((m) => ({
              id: m.id,
              title: m.title,
            }));
            systemPrompt = buildLocalChatSystemPrompt({
              core: VMEM_LOCAL_CHAT_CORE,
              memoryCandidates: retrieved.memories.map((m) => ({
                id: m.id,
                title: m.title,
                content: m.content,
                trace: { reason: m.trace.reason },
              })),
              skills: mySkills.map((skill) => ({
                name: skill.name,
                description: skill.description,
                instructions: skill.instructions,
                enabled: skill.enabled,
              })),
              userMessage: text,
            });
          } catch (retrieveError) {
            console.error("retrieveMemories failed:", retrieveError);
            systemPrompt = buildLocalChatSystemPrompt({
              core: VMEM_LOCAL_CHAT_CORE,
              memoryCandidates: [],
              skills: mySkills.map((skill) => ({
                name: skill.name,
                description: skill.description,
                instructions: skill.instructions,
                enabled: skill.enabled,
              })),
              userMessage: text,
            });
          }
        }

        setDraftMemoryRefsByKey((prev) => ({
          ...prev,
          [assistantMsg.key]: memoryRefs,
        }));

        const conversationHistory = priorForOrdering.flatMap((message) => {
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
          system: systemPrompt,
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

        if (threadId && accumulated && isOnline) {
          const hasRefs = memoryRefs.length > 0;
          await saveLocalMessages({
            threadId,
            userText: text,
            assistantText: accumulated,
            ...(hasRefs
              ? {
                  memoryRefs,
                  assistantOrder: assistantMsg.order,
                  assistantStepOrder: assistantMsg.stepOrder,
                }
              : {}),
          });
          setLocalMessages([]);
          setDraftMemoryRefsByKey({});
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
    [
      isOnline,
      localStreaming,
      priorForOrdering,
      retrieveMemories,
      saveLocalMessages,
      threadId,
      mySkills,
    ],
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

  const messages =
    isOnline && persistedMessages.length > 0
      ? persistedMessages.concat(localMessages)
      : localMessages;

  const memoryRefsByMessageKey: Record<string, ChatMemoryRef[]> = {
    ...persistedMemoryRefsByKey,
    ...draftMemoryRefsByKey,
  };

  const isStreaming = localStreaming;
  const isReady = mode === "ready" && localReady;

  return {
    messages,
    sendMessage,
    isStreaming,
    isReady,
    mode,
    memoryRefsByMessageKey,
  };
}
