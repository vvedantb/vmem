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
import Link from "next/link";
import ChatMessageItem from "@/app/(main)/chat/_components/ChatMessageItem";
import { useLocalChat } from "@/hooks/useLocalChat";
import { useWebLLM } from "@/components/contexts/WebLLMContext";

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
  const {
    isThreadReady,
    isReady,
    messages,
    sendMessage,
    isStreaming,
    usageByMessageKey,
  } = useLocalChat();
  const { engineState } = useWebLLM();

  const promptStatus = isStreaming ? "streaming" : "ready";

  const handleSubmit = useCallback(
    async ({ text }: PromptInputMessage) => {
      if (!text) return;
      await sendMessage(text);
    },
    [sendMessage],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      handleSubmit({ text: suggestion });
    },
    [handleSubmit],
  );

  // Show loader while thread is being created
  if (!isThreadReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No model loaded — prompt user to load one
  const needsModel = engineState !== "ready";

  return (
    <div className="flex flex-col h-full min-h-0">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="pb-4 max-w-4xl mx-auto w-full px-1 sm:px-0">
          {messages.length === 0 && needsModel && (
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
              title="No local model loaded"
              description="Load a local model to start chatting."
            >
              <Link
                href="/settings/preferences"
                className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Go to Settings &rarr; Preferences
              </Link>
            </ConversationEmptyState>
          )}

          {messages.length === 0 && !needsModel && (
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
              description="Ask anything — running locally in your browser."
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
            <ChatMessageItem
              key={message.key}
              message={message}
              usage={usageByMessageKey[message.key]}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="flex-shrink-0 max-w-3xl mx-auto w-full px-1 sm:px-0">
        <PromptInput onSubmit={handleSubmit} status={promptStatus}>
          <PromptInputTextarea
            placeholder={
              needsModel
                ? "Load a local model to chat..."
                : "Ask about your memories..."
            }
            {...(needsModel ? { disabled: true } : {})}
          />
          <PromptInputFooter>
            <ChatSpeechInput />
            <PromptInputSubmit {...(needsModel ? { disabled: true } : {})} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
