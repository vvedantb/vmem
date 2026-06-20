"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
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
import { ChatPromptTextarea } from "@/components/chat/_components/ChatPromptTextarea";
import CloudModelSelector from "@/components/chat/_components/CloudModelSelector";
import ProviderToggle from "@/components/chat/_components/ProviderToggle";
import LocalModelProviderIcon from "@/components/LocalModelProviderIcon";
import { useChatProvider } from "@/hooks/useChatProvider";
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
          className="inline-flex items-center gap-1 rounded-full bg-default px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-default/78 hover:text-foreground disabled:opacity-50"
          disabled={isLoading}
        >
          {loadedInfo ? (
            <LocalModelProviderIcon provider={loadedInfo.provider} size={12} />
          ) : (
            <IconCpu className="size-3" stroke={1.5} />
          )}
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Local model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Array.from(providerGroups).map(([provider, models]) => (
          <DropdownMenuSub key={provider}>
            <DropdownMenuSubTrigger className="gap-2">
              <LocalModelProviderIcon provider={provider} size={14} />
              {provider}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={loadedModelId ?? ""}
                onValueChange={handleSelect}
              >
                {models.map((model) => (
                  <DropdownMenuRadioItem
                    key={model.id}
                    value={model.id}
                    className="gap-2"
                  >
                    <LocalModelProviderIcon
                      provider={model.provider}
                      size={14}
                    />
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
    provider,
    setProvider,
    isThreadReady,
    isReady,
    messages,
    sendMessage,
    clearHistory,
    isStreaming,
    isClearing,
    usageByMessageKey,
    memoryRefsByMessageKey,
    hasOpenRouterKey,
    cloudModelId,
    setCloudModelId,
  } = useChatProvider();
  const { engineState, loadedModelId } = useLocalLLM();

  // Names of the user's effective skills (personal + installed system) so
  // `/skill` mentions in sent messages render as pills, like the input does.
  const effectiveSkills = useQuery(api.skills.listEffectiveSkills, {});
  const skillNames = useMemo(
    () => new Set((effectiveSkills ?? []).map((skill) => skill.name)),
    [effectiveSkills],
  );

  const [clearOpen, setClearOpen] = useState(false);

  const promptStatus = isStreaming ? "streaming" : "ready";

  const loadedModel = loadedModelId ? findModel(loadedModelId) : undefined;
  const localMaxContextTokens =
    loadedModel?.contextLength ?? DEFAULT_CONTEXT_LENGTH;
  const maxContextTokens =
    provider === "cloud" ? 131072 : localMaxContextTokens;

  const isLocal = provider === "local";
  const needsLocalModel = isLocal && engineState !== "ready";
  const needsOpenRouterKey = !isLocal && !hasOpenRouterKey;
  const needsCloudModel = !isLocal && hasOpenRouterKey && cloudModelId === null;
  const inputDisabled =
    needsLocalModel || needsOpenRouterKey || needsCloudModel;

  const handleSubmit = useCallback(
    async ({ text }: PromptInputMessage) => {
      if (!text || !isReady) return;
      try {
        await sendMessage(text);
      } catch (error) {
        console.error("Failed to send message:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to send message",
        );
      }
    },
    [isReady, sendMessage],
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

  // No model loaded — prompt user to load one (local) or configure cloud
  const showLocalEmpty = messages.length === 0 && needsLocalModel;
  const showCloudKeyEmpty = messages.length === 0 && needsOpenRouterKey;
  const showReadyEmpty =
    messages.length === 0 &&
    !needsLocalModel &&
    !needsOpenRouterKey &&
    !needsCloudModel;

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
          {showLocalEmpty && (
            <ConversationEmptyState
              icon={
                <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-surface">
                  <img
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-dark.svg"
                    className="block dark:hidden outline outline-1 -outline-offset-1 outline-foreground/10 rounded-full"
                  />
                  <img
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-light.svg"
                    className="hidden dark:block outline outline-1 -outline-offset-1 outline-foreground/10 rounded-full"
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

          {showCloudKeyEmpty && (
            <ConversationEmptyState
              icon={
                <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-surface">
                  <img
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-dark.svg"
                    className="block dark:hidden outline outline-1 -outline-offset-1 outline-foreground/10 rounded-full"
                  />
                  <img
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-light.svg"
                    className="hidden dark:block outline outline-1 -outline-offset-1 outline-foreground/10 rounded-full"
                  />
                </div>
              }
              title="OpenRouter API key required"
              description="Add OPENROUTER_API_KEY in Settings → Secrets to use cloud chat with free models and vmem tools."
            >
              <Link
                to="/settings/secrets"
                className="mt-2 text-xs text-muted underline-offset-4 hover:underline"
              >
                Configure secrets
              </Link>
            </ConversationEmptyState>
          )}

          {showReadyEmpty && (
            <ConversationEmptyState
              icon={
                <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-surface">
                  <img
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-dark.svg"
                    className="block dark:hidden outline outline-1 -outline-offset-1 outline-foreground/10 rounded-full"
                  />
                  <img
                    width={22}
                    height={22}
                    alt="vmem"
                    src="/icon-light.svg"
                    className="hidden dark:block outline outline-1 -outline-offset-1 outline-foreground/10 rounded-full"
                  />
                </div>
              }
              title="Start a conversation"
              description={
                isLocal
                  ? "Ask anything — running locally in your browser."
                  : "Ask anything — cloud model with vmem tools (memories, skills, wiki)."
              }
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
              skillNames={skillNames}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="flex-shrink-0 max-w-3xl mx-auto w-full px-1 sm:px-0">
        <PromptInput onSubmit={handleSubmit} status={promptStatus}>
          <ChatPromptTextarea
            placeholder={
              needsLocalModel
                ? "Select a local model to chat..."
                : needsOpenRouterKey
                  ? "Add OPENROUTER_API_KEY in Settings..."
                  : needsCloudModel
                    ? "Select a cloud model..."
                    : "Ask about your memories... Type / for skills."
            }
            {...(inputDisabled ? { disabled: true } : {})}
          />
          <PromptInputFooter>
            <div className="flex items-center gap-1.5">
              <ProviderToggle
                provider={provider}
                onChange={setProvider}
                disabled={isStreaming}
              />
              {isLocal ? (
                <ModelSelector />
              ) : (
                <CloudModelSelector
                  modelId={cloudModelId}
                  onSelectModel={setCloudModelId}
                  disabled={!hasOpenRouterKey || isStreaming}
                />
              )}
            </div>
            {isLocal ? <ChatSpeechInput /> : null}
            <PromptInputSubmit {...(inputDisabled ? { disabled: true } : {})} />
          </PromptInputFooter>
        </PromptInput>
      </div>

      <Dialog
        open={clearOpen}
        onOpenChange={(open) => {
          if (!open && !isClearing) setClearOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-sm">
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
              className="bg-danger text-danger-foreground"
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
