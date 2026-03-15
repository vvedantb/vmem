"use client";

import { useState, useCallback } from "react";
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
import { IconMessage } from "@tabler/icons-react";
import ChatMessageItem from "@/app/(main)/chat/_components/ChatMessageItem";

export default function Chat() {
  const [threadId, setThreadId] = useState<string | null>(null);

  const createThread = useMutation(api.chat.createNewThread);
  const sendMessage = useMutation(
    api.chat.initiateStreaming,
  ).withOptimisticUpdate((store, args) => {
    optimisticallySendMessage(api.chat.listThreadMessages)(store, args);
  });

  const { results: messages, status: paginationStatus } = useUIMessages(
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
      if (!text) return;

      let activeThreadId = threadId;
      if (!activeThreadId) {
        const result = await createThread();
        activeThreadId = result.threadId;
        setThreadId(activeThreadId);
      }

      await sendMessage({ prompt: text, threadId: activeThreadId });
    },
    [threadId, createThread, sendMessage],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      handleSubmit({ text: suggestion });
    },
    [handleSubmit],
  );

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="pb-4">
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={
                <IconMessage
                  className="size-8 text-muted-foreground"
                  stroke={1.5}
                />
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

      <div className="mt-4 flex-shrink-0 max-w-2xl mx-auto w-full">
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
