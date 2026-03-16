"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import {
  useUIMessages,
  optimisticallySendMessage,
} from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  Suggestion,
  Suggestions,
  type PromptInputMessage,
} from "@vmem/ui/ai";
import Image from "next/image";
import ChatMessageItem from "@/app/(main)/chat/_components/ChatMessageItem";

export default function Chat() {
  const [threadId, setThreadId] = useState<string | null>(null);

  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const sendMessage = useMutation(
    api.chat.initiateStreaming,
  ).withOptimisticUpdate((store, args) => {
    optimisticallySendMessage(api.chat.listThreadMessages)(store, args);
  });

  useEffect(() => {
    getOrCreateThread().then((id) => setThreadId(id));
  }, [getOrCreateThread]);

  const { results: messages } = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const isWaitingForResponse = messages.some(
    (m) => m.role === "assistant" && m.status === "streaming",
  );
  const promptStatus = isWaitingForResponse ? "streaming" : "ready";

  const handleSubmit = useCallback(
    async ({ text }: PromptInputMessage) => {
      if (!text || !threadId) return;
      await sendMessage({ prompt: text, threadId });
    },
    [threadId, sendMessage],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      handleSubmit({ text: suggestion });
    },
    [handleSubmit],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="pb-4 max-w-4xl mx-auto w-full px-1 sm:px-0">
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={
                <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                  <Image
                    unoptimized
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-dark.svg"
                    className="block dark:hidden"
                  />
                  <Image
                    unoptimized
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-light.svg"
                    className="hidden dark:block"
                  />
                </div>
              }
              title="Start a conversation"
              description="Ask anything about your stored memories. The AI will search and reference relevant information."
            >
              <Suggestions className="max-w-md">
                {[
                  "What do I know about React?",
                  "Tell me about Docker",
                  "Summarize my TypeScript notes",
                ].map((suggestion) => (
                  <Suggestion
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </Suggestion>
                ))}
              </Suggestions>
            </ConversationEmptyState>
          )}

          {messages.map((message) => (
            <ChatMessageItem key={message.key} message={message} />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="flex-shrink-0 max-w-3xl mx-auto w-full px-1 sm:px-0">
        <PromptInput onSubmit={handleSubmit} status={promptStatus}>
          <PromptInputTextarea placeholder="Ask about your memories..." />
          <PromptInputFooter>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
