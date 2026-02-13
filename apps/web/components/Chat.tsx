"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { Card, CardContent, Input, Button, Badge, Skeleton } from "@vmem/ui";
import {
  IconMessage,
  IconSend,
  IconUser,
  IconRobot,
  IconBrain,
  IconLoader2,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";

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
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedMemories, setExpandedMemories] = useState<Set<string>>(
    new Set(),
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const toggleMemoryExpansion = useCallback((messageId: string) => {
    setExpandedMemories((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      const message = inputValue.trim();
      if (!message || isLoading) return;

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: message,
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
      setInputValue("");
      setIsLoading(true);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            history: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to get response");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let relevantMemories: Memory[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "memories") {
                  relevantMemories = data.data;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, relevantMemories }
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
                // Ignore JSON parse errors for incomplete chunks
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

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
        setIsLoading(false);
        abortControllerRef.current = null;
        inputRef.current?.focus();
      }
    },
    [inputValue, isLoading, messages],
  );

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <Card className="flex-1 border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center mb-6">
              <IconMessage className="w-8 h-8 text-neutral-400" stroke={1.5} />
            </div>
            <h3 className="text-lg font-medium text-black dark:text-white mb-2">
              Start a conversation
            </h3>
            <p className="text-neutral-500 max-w-sm mb-6">
              Ask anything about your stored memories. The AI will search and
              reference relevant information.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {[
                "What do I know about React?",
                "Tell me about Docker",
                "Summarize my TypeScript notes",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInputValue(suggestion)}
                  className="px-3 py-1.5 text-sm border border-black/10 dark:border-white/10 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-neutral-600 dark:text-neutral-400"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
          <Input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about your memories..."
            disabled={isLoading}
            className="h-14 bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 shadow-none text-black dark:text-white"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            disabled={!inputValue.trim() || isLoading}
            className="bg-black dark:bg-white text-white dark:text-black min-w-14 h-14 w-14"
          >
            {isLoading ? (
              <IconLoader2 size={20} className="animate-spin" />
            ) : (
              <IconSend size={20} stroke={1.5} />
            )}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 -mr-4 pr-4">
        <div className="space-y-4 pb-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center flex-shrink-0">
                  <IconRobot
                    size={16}
                    className="text-neutral-500"
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
                        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
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
                              className="p-3 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]"
                            >
                              <div className="text-sm font-medium text-black dark:text-white mb-1">
                                {memory.title}
                              </div>
                              <div className="text-xs text-neutral-500 line-clamp-2">
                                {memory.content}
                              </div>
                              <div className="flex gap-1 mt-2 flex-wrap">
                                {memory.tags.map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-neutral-500 text-[10px] px-1 h-5"
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

                <div
                  className={`px-4 py-3 rounded-2xl ${
                    message.role === "user"
                      ? "bg-black dark:bg-white text-white dark:text-black rounded-br-md"
                      : "bg-black/[0.03] dark:bg-white/[0.05] border border-black/10 dark:border-white/10 text-black dark:text-white rounded-bl-md"
                  }`}
                >
                  {message.isStreaming && !message.content ? (
                    <div className="flex gap-1">
                      <Skeleton className="w-2 h-2 rounded-full" />
                      <Skeleton className="w-2 h-2 rounded-full" />
                      <Skeleton className="w-2 h-2 rounded-full" />
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">
                      {message.content}
                      {message.isStreaming && (
                        <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse" />
                      )}
                    </div>
                  )}
                </div>

                <span className="text-[10px] text-neutral-400 mt-1 px-1">
                  {formatTime(message.timestamp)}
                </span>
              </div>

              {message.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
                  <IconUser
                    size={16}
                    className="text-white dark:text-black"
                    stroke={1.5}
                  />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-3 flex-shrink-0">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask about your memories..."
          disabled={isLoading}
          className="h-14 bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 shadow-none text-black dark:text-white"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          disabled={!inputValue.trim() || isLoading}
          className="bg-black dark:bg-white text-white dark:text-black min-w-14 h-14 w-14"
        >
          {isLoading ? (
            <IconLoader2 size={20} className="animate-spin" />
          ) : (
            <IconSend size={20} stroke={1.5} />
          )}
        </Button>
      </form>
    </div>
  );
}
