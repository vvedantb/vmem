"use client";

import { useState, useRef, useCallback, type FormEvent } from "react";
import { Badge } from "@vmem/ui";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
  MessageToolbar,
  MessageAction,
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@vmem/ui/ai";
import {
  IconMessage,
  IconRobot,
  IconUser,
  IconBrain,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconCheck,
} from "@tabler/icons-react";
import type { ChatStatus } from "ai";

interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  relevantMemories?: Memory[];
  isStreaming?: boolean;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [expandedMemories, setExpandedMemories] = useState<Set<string>>(
    new Set(),
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const toggleMemoryExpansion = useCallback((messageId: string) => {
    setExpandedMemories((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const handleCopy = useCallback((messageId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStatus("ready");
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
  }, []);

  const handleSubmit = useCallback(
    async ({ text }: PromptInputMessage, _e: FormEvent) => {
      if (!text || status !== "ready") return;

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };

      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setStatus("streaming");

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) throw new Error("Failed to get response");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "memories") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, relevantMemories: data.data }
                        : m,
                    ),
                  );
                } else if (data.type === "content") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, content: data.data }
                        : m,
                    ),
                  );
                } else if (data.type === "done") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, isStreaming: false }
                        : m,
                    ),
                  );
                }
              } catch {
                // Ignore incomplete JSON chunks
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content:
                    "Sorry, I encountered an error processing your request. Please try again.",
                  isStreaming: false,
                }
              : m,
          ),
        );
      } finally {
        setStatus("ready");
        abortControllerRef.current = null;
      }
    },
    [status, messages],
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
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {[
                  "What do I know about React?",
                  "Tell me about Docker",
                  "Summarize my TypeScript notes",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-3 py-1.5 text-sm border border-border rounded-full hover:bg-accent transition-colors text-muted-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          )}

          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              {message.role === "assistant" && (
                <div className="flex size-8 items-center justify-center rounded-full bg-muted/50 border border-border shrink-0">
                  <IconRobot
                    className="size-4 text-muted-foreground"
                    stroke={1.5}
                  />
                </div>
              )}

              <div
                className={`flex flex-col max-w-[80%] ${message.role === "user" ? "items-end" : "items-start"}`}
              >
                {message.role === "assistant" &&
                  message.relevantMemories &&
                  message.relevantMemories.length > 0 && (
                    <div className="mb-2 w-full">
                      <button
                        onClick={() => toggleMemoryExpansion(message.id)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <IconBrain size={14} stroke={1.5} />
                        <span>
                          {message.relevantMemories.length} relevant{" "}
                          {message.relevantMemories.length === 1
                            ? "memory"
                            : "memories"}
                        </span>
                        {expandedMemories.has(message.id) ? (
                          <IconChevronUp size={14} />
                        ) : (
                          <IconChevronDown size={14} />
                        )}
                      </button>

                      {expandedMemories.has(message.id) && (
                        <div className="mt-2 space-y-2">
                          {message.relevantMemories.map((memory) => (
                            <div
                              key={memory.id}
                              className="p-3 rounded-lg border border-border bg-muted/30"
                            >
                              <div className="text-sm font-medium text-foreground mb-1">
                                {memory.title}
                              </div>
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {memory.content}
                              </div>
                              <div className="flex gap-1 mt-2 flex-wrap">
                                {memory.tags.map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="bg-muted/50 text-muted-foreground text-[10px] px-1 h-5"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                <MessageContent>
                  {message.isStreaming && !message.content ? (
                    <div className="flex gap-1.5 py-1">
                      <span className="size-2 rounded-full bg-muted-foreground/40 animate-pulse" />
                      <span className="size-2 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:150ms]" />
                      <span className="size-2 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:300ms]" />
                    </div>
                  ) : message.role === "assistant" ? (
                    <MessageResponse>{message.content}</MessageResponse>
                  ) : (
                    <span className="whitespace-pre-wrap">
                      {message.content}
                    </span>
                  )}
                </MessageContent>

                {message.role === "assistant" &&
                  !message.isStreaming &&
                  message.content && (
                    <MessageToolbar>
                      <MessageAction
                        tooltip="Copy"
                        onClick={() => handleCopy(message.id, message.content)}
                      >
                        {copiedId === message.id ? (
                          <IconCheck className="size-3.5" stroke={1.5} />
                        ) : (
                          <IconCopy className="size-3.5" stroke={1.5} />
                        )}
                      </MessageAction>
                    </MessageToolbar>
                  )}
              </div>

              {message.role === "user" && (
                <div className="flex size-8 items-center justify-center rounded-full bg-primary shrink-0">
                  <IconUser
                    className="size-4 text-primary-foreground"
                    stroke={1.5}
                  />
                </div>
              )}
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mt-4 flex-shrink-0">
        <PromptInput
          onSubmit={handleSubmit}
          input={input}
          onInputChange={setInput}
          status={status}
        >
          <PromptInputTextarea placeholder="Ask about your memories..." />
          <PromptInputFooter>
            <PromptInputSubmit onStop={handleStop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
