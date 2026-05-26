/**
 * Collapsible bottom drawer for voice conversation history.
 * Hidden by default — user toggles via a pill trigger button.
 * Renders all messages using the shared ChatMessageItem component.
 */
"use client";

import { useState, useRef, useEffect } from "react";
import {
  IconChevronUp,
  IconChevronDown,
  IconMessageCircle,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import type { UIMessage } from "@convex-dev/agent/react";
import ChatMessageItem from "@/components/chat/_components/ChatMessageItem";
import type { ChatMemoryRef } from "@/hooks/useLocalChat";

interface VoiceHistoryDrawerProps {
  messages: UIMessage[];
  memoryRefsByMessageKey: Record<string, ChatMemoryRef[]>;
}

export default function VoiceHistoryDrawer({
  messages,
  memoryRefsByMessageKey,
}: VoiceHistoryDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when opened or new messages arrive
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, messages.length]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Drawer panel — slides up above trigger */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute bottom-full left-0 right-0 mb-2 bg-surface-secondary/40 rounded-lg overflow-hidden"
            initial={{ opacity: 0, y: 12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 12, height: 0 }}
            transition={{ duration: motionDuration.base, ease: motionEase }}
          >
            <div
              ref={scrollRef}
              className="max-h-56 sm:max-h-72 overflow-y-auto scrollbar-thin p-4 space-y-1"
            >
              <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
                Conversation
              </p>
              {messages.map((message) => (
                <ChatMessageItem
                  key={message.key}
                  message={message}
                  memoryRefs={memoryRefsByMessageKey[message.key]}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger button */}
      <motion.button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "mx-auto flex items-center gap-2 rounded-full px-4 py-2",
          "text-xs font-medium text-muted",
          "transition-colors hover:bg-surface-secondary/40",
        )}
        whileTap={{ scale: 0.97 }}
        aria-label={isOpen ? "Hide conversation" : "Show conversation"}
        aria-expanded={isOpen}
      >
        <IconMessageCircle className="size-3.5" stroke={1.5} />
        <span>
          {isOpen ? "Hide" : "Show"} conversation ({messages.length})
        </span>
        {isOpen ? (
          <IconChevronDown className="size-3.5" stroke={1.5} />
        ) : (
          <IconChevronUp className="size-3.5" stroke={1.5} />
        )}
      </motion.button>
    </div>
  );
}
