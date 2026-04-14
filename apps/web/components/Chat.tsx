"use client";

import { useCallback } from "react";
import { IconCpu, IconLoader2 } from "@tabler/icons-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@vmem/ui";
import Image from "next/image";
import Link from "next/link";
import ChatMessageItem from "@/app/(main)/chat/_components/ChatMessageItem";
import { useLocalChat } from "@/hooks/useLocalChat";
import { useLocalLLM } from "@/components/contexts/LocalLLMContext";
import { findModel, groupByProvider } from "@/lib/local-models";

/** Fallback context length when model info isn't available. */
const DEFAULT_CONTEXT_LENGTH = 4096;

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

const providerGroups = groupByProvider();

/** Dropdown to select and switch between available local models. */
function ModelSelector() {
  const { loadedModelId, engineState, loadModel, isSupported } = useLocalLLM();

  if (!isSupported) return null;

  const loadedInfo = loadedModelId ? findModel(loadedModelId) : undefined;
  const label =
    loadedInfo?.name ??
    (engineState === "loading" ? "Loading..." : "Select model");
  const isLoading = engineState === "loading";

  const handleSelect = (modelId: string) => {
    if (modelId === loadedModelId || isLoading) return;
    void loadModel(modelId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          disabled={isLoading}
        >
          <IconCpu className="size-3" stroke={1.5} />
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Local model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Array.from(providerGroups).map(([provider, models]) => (
          <DropdownMenuSub key={provider}>
            <DropdownMenuSubTrigger>{provider}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={loadedModelId ?? ""}
                onValueChange={handleSelect}
              >
                {models.map((model) => (
                  <DropdownMenuRadioItem key={model.id} value={model.id}>
                    {model.name}
                    <span className="ml-auto pl-3 text-[11px] text-muted-foreground">
                      {model.size}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Chat() {
  const {
    isThreadReady,
    messages,
    sendMessage,
    isStreaming,
    usageByMessageKey,
    memoryRefsByMessageKey,
  } = useLocalChat();
  const { engineState, loadedModelId } = useLocalLLM();

  const promptStatus = isStreaming ? "streaming" : "ready";

  const loadedModel = loadedModelId ? findModel(loadedModelId) : undefined;
  const maxContextTokens = loadedModel?.contextLength ?? DEFAULT_CONTEXT_LENGTH;

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
              description="Select a model below to start chatting."
            >
              <Link
                href="/settings/preferences"
                className="mt-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Or manage models in Settings
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
              memoryRefs={memoryRefsByMessageKey[message.key]}
              maxContextTokens={maxContextTokens}
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
                ? "Select a model to chat..."
                : "Ask about your memories..."
            }
            {...(needsModel ? { disabled: true } : {})}
          />
          <PromptInputFooter>
            <ModelSelector />
            <ChatSpeechInput />
            <PromptInputSubmit {...(needsModel ? { disabled: true } : {})} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
