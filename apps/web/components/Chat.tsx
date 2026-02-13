"use client";

import { useState, useRef, useCallback, type FormEvent } from "react";
import { Badge } from "@vmem/ui";
import {
  Action,
  Actions,
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtTrigger,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  InlineCitation,
  Message,
  MessageContent,
  MessageResponse,
  Plan,
  PlanHeader,
  PlanItem,
  PlanList,
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  Sources,
  SourcesContent,
  SourcesTrigger,
  Suggestion,
  Suggestions,
  Task,
  Tool,
  ToolInput,
  ToolOutput,
  type PromptInputMessage,
} from "@vmem/ui/ai";
import {
  IconMessage,
  IconRobot,
  IconUser,
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
  reasoning?: string;
  plan?: string[];
  tool?: {
    name: string;
    state: "input-available" | "running" | "output-available" | "output-error";
    input?: unknown;
    output?: unknown;
  };
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

  const toggleMemoryExpansion = useCallback(
    (messageId: string, nextOpen?: boolean) => {
      setExpandedMemories((prev) => {
        const next = new Set(prev);
        if (typeof nextOpen === "boolean") {
          if (nextOpen) next.add(messageId);
          else next.delete(messageId);
        } else if (next.has(messageId)) next.delete(messageId);
        else next.add(messageId);
        return next;
      });
    },
    [],
  );

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
                } else if (data.type === "reasoning") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, reasoning: data.data }
                        : m,
                    ),
                  );
                } else if (data.type === "plan") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, plan: data.data }
                        : m,
                    ),
                  );
                } else if (data.type === "tool") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? {
                            ...m,
                            tool: {
                              ...m.tool,
                              ...data.data,
                            },
                          }
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
              <Suggestions className="max-w-md">
                {[
                  "What do I know about React?",
                  "Tell me about Docker",
                  "Summarize my TypeScript notes",
                ].map((suggestion) => (
                  <Suggestion
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                  >
                    {suggestion}
                  </Suggestion>
                ))}
              </Suggestions>
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
                {message.role === "assistant" && message.reasoning && (
                  <div className="mb-2 w-full">
                    <ChainOfThought isStreaming={message.isStreaming}>
                      <ChainOfThoughtTrigger />
                      <ChainOfThoughtContent>
                        {message.reasoning}
                      </ChainOfThoughtContent>
                    </ChainOfThought>
                  </div>
                )}

                {message.role === "assistant" && message.tool && (
                  <div className="mb-2 w-full space-y-2">
                    <Task
                      status={
                        message.tool.state === "output-available"
                          ? "completed"
                          : message.tool.state === "output-error"
                            ? "failed"
                            : "running"
                      }
                    >
                      Tool: {message.tool.name}
                    </Task>
                    <Tool name={message.tool.name} state={message.tool.state}>
                      <div className="space-y-2">
                        {message.tool.input !== undefined && (
                          <ToolInput input={message.tool.input} />
                        )}
                        {message.tool.output !== undefined && (
                          <ToolOutput output={message.tool.output} />
                        )}
                      </div>
                    </Tool>
                  </div>
                )}

                {message.role === "assistant" &&
                  message.plan &&
                  message.plan.length > 0 && (
                    <div className="mb-2 w-full">
                      <Plan>
                        <PlanHeader>Execution plan</PlanHeader>
                        <PlanList>
                          {message.plan.map((step, idx) => {
                            const isLast = idx === message.plan!.length - 1;
                            const status = message.isStreaming
                              ? isLast
                                ? "in_progress"
                                : "completed"
                              : "completed";
                            return (
                              <PlanItem
                                key={`${message.id}-plan-${idx}`}
                                status={status}
                              >
                                {step}
                              </PlanItem>
                            );
                          })}
                        </PlanList>
                      </Plan>
                    </div>
                  )}

                {message.role === "assistant" &&
                  message.relevantMemories &&
                  message.relevantMemories.length > 0 && (
                    <div className="mb-2 w-full">
                      <Sources
                        open={expandedMemories.has(message.id)}
                        onOpenChange={(open) =>
                          toggleMemoryExpansion(message.id, open)
                        }
                      >
                        <SourcesTrigger
                          count={message.relevantMemories.length}
                          label={
                            message.relevantMemories.length === 1
                              ? "relevant memory"
                              : "relevant memories"
                          }
                        />
                        <SourcesContent>
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
                        </SourcesContent>
                      </Sources>
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
                  message.relevantMemories &&
                  message.relevantMemories.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {message.relevantMemories.map((memory, idx) => (
                        <InlineCitation
                          key={`${message.id}-citation-${memory.id}`}
                          index={idx + 1}
                          href={
                            memory.tags[0]
                              ? `/memories/list?tag=${encodeURIComponent(memory.tags[0])}`
                              : "/memories/list"
                          }
                        >
                          [{idx + 1}] {memory.title}
                        </InlineCitation>
                      ))}
                    </div>
                  )}

                {message.role === "assistant" &&
                  !message.isStreaming &&
                  message.content && (
                    <Actions className="mt-1">
                      <Action
                        tooltip="Copy"
                        label="Copy response"
                        onClick={() => handleCopy(message.id, message.content)}
                      >
                        {copiedId === message.id ? (
                          <IconCheck className="size-3.5" stroke={1.5} />
                        ) : (
                          <IconCopy className="size-3.5" stroke={1.5} />
                        )}
                      </Action>
                    </Actions>
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
