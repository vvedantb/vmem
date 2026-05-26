"use client";

import { useCallback, useState } from "react";
import {
  IconAlertTriangle,
  IconCpu,
  IconLoader2,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { VmemSpinner } from "@/components/svg-animations";
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
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Link } from "@tanstack/react-router";
import ChatMessageItem from "@/components/chat/_components/ChatMessageItem";
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
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-secondary/50 px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-foreground disabled:opacity-50"
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
    clearHistory,
    isStreaming,
    isClearing,
    usageByMessageKey,
    memoryRefsByMessageKey,
  } = useLocalChat();
  const { engineState, loadedModelId } = useLocalLLM();

  const [clearOpen, setClearOpen] = useState(false);

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

  const handleConfirmClear = useCallback(async () => {
    try {
      await clearHistory();
      setClearOpen(false);
      toast.success("Chat history cleared");
    } catch (error) {
      console.error("Failed to clear chat history:", error);
      toast.error("Failed to clear chat history");
    }
  }, [clearHistory]);

  // Show loader while thread is being created
  if (!isThreadReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <VmemSpinner size={24} className="text-muted" />
      </div>
    );
  }

  // No model loaded — prompt user to load one
  const needsModel = engineState !== "ready";

  // Show the clear-chat affordance only when there's something to clear —
  // keeps the empty state quiet.
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {hasMessages && (
        <div className="flex-shrink-0 max-w-4xl mx-auto w-full px-1 sm:px-0 flex justify-end pt-1 pb-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setClearOpen(true)}
            disabled={isClearing || isStreaming}
            className="text-muted hover:text-foreground"
          >
            {isClearing ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconTrash className="size-4" stroke={1.5} />
            )}
            Clear chat
          </Button>
        </div>
      )}

      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="pb-4 max-w-4xl mx-auto w-full px-1 sm:px-0">
          {messages.length === 0 && needsModel && (
            <ConversationEmptyState
              icon={
                <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                  <img
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-dark.svg"
                    className="block dark:hidden outline outline-1 -outline-offset-1 outline-black/10 rounded-full"
                  />
                  <img
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-light.svg"
                    className="hidden dark:block outline outline-1 -outline-offset-1 outline-white/10 rounded-full"
                  />
                </div>
              }
              title="No local model loaded"
              description="Select a model below to start chatting."
            >
              <Link
                to="/settings/preferences"
                className="mt-2 text-xs text-muted underline-offset-4 hover:underline"
              >
                Or manage models in Settings
              </Link>
            </ConversationEmptyState>
          )}

          {messages.length === 0 && !needsModel && (
            <ConversationEmptyState
              icon={
                <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                  <img
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-dark.svg"
                    className="block dark:hidden outline outline-1 -outline-offset-1 outline-black/10 rounded-full"
                  />
                  <img
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-light.svg"
                    className="hidden dark:block outline outline-1 -outline-offset-1 outline-white/10 rounded-full"
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

      <Dialog
        open={clearOpen}
        onOpenChange={(open) => {
          if (!open && !isClearing) setClearOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-sm bg-surface border border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Clear chat history
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirm deleting the current chat thread and all its messages.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 py-4">
            <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center flex-shrink-0">
              <IconAlertTriangle size={20} className="text-danger" />
            </div>
            <div>
              <p className="text-foreground">
                Are you sure you want to clear this chat?
              </p>
              <p className="text-sm text-muted mt-1">
                This deletes every message in the thread. This action cannot be
                undone — but you can keep chatting in a fresh thread right
                after.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setClearOpen(false)}
              disabled={isClearing}
              className="text-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmClear}
              disabled={isClearing}
              className="bg-danger text-accent-foreground"
            >
              {isClearing ? (
                <>
                  <IconLoader2 className="size-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                "Clear chat"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
