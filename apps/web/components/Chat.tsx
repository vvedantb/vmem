"use client";

import { useCallback } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  SpeechInput,
  Suggestion,
  Suggestions,
  usePromptInput,
  type PromptInputMessage,
} from "@vmem/ui/ai";
import Image from "next/image";
import ChatMessageItem from "@/app/(main)/chat/_components/ChatMessageItem";
import ProviderToggle from "@/app/(main)/chat/_components/ProviderToggle";
import { useCloudChat } from "@/hooks/useCloudChat";
import { useLocalChat } from "@/hooks/useLocalChat";
import { useChatProvider } from "@/hooks/useChatProvider";

function ChatSpeechInput() {
  const { input, setInput } = usePromptInput();
  const handleTranscription = useCallback(
    (text: string) => {
      const separator = input.trim() ? " " : "";
      setInput(input + separator + text);
    },
    [input, setInput],
  );

  return (
    <SpeechInput
      onTranscriptionChange={handleTranscription}
      size="icon-xs"
      variant="ghost"
    />
  );
}

export default function Chat() {
  const { provider } = useChatProvider();
  const cloud = useCloudChat();
  const local = useLocalChat(cloud.threadId);

  // Branch on provider — both hooks always run, but only one drives the UI
  const active = provider === "local" && local.isReady ? local : cloud;

  const isWaitingForResponse = active.isStreaming;
  const promptStatus = isWaitingForResponse ? "streaming" : "ready";

  const handleSubmit = useCallback(
    async ({ text }: PromptInputMessage) => {
      if (!text) return;
      await active.sendMessage(text);
    },
    [active],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      handleSubmit({ text: suggestion });
    },
    [handleSubmit],
  );

  if (!cloud.isReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="pb-4 max-w-4xl mx-auto w-full px-1 sm:px-0">
          {active.messages.length === 0 && (
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

          {active.messages.map((message) => (
            <ChatMessageItem
              key={message.key}
              message={message}
              usage={active.usageByMessageKey[message.key]}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="flex-shrink-0 max-w-3xl mx-auto w-full px-1 sm:px-0">
        <PromptInput onSubmit={handleSubmit} status={promptStatus}>
          <PromptInputTextarea placeholder="Ask about your memories..." />
          <PromptInputFooter>
            <ProviderToggle />
            <ChatSpeechInput />
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
