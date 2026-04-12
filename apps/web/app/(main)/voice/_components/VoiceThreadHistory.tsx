/**
 * Compact thread history panel for the /voice route.
 * Shows the last N messages from the shared Convex thread,
 * reusing the ChatMessageItem component for rendering.
 */
"use client";

import { motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import type { UIMessage } from "@convex-dev/agent/react";
import ChatMessageItem from "@/app/(main)/chat/_components/ChatMessageItem";

interface VoiceThreadHistoryProps {
  messages: UIMessage[];
}

const MAX_VISIBLE = 6;

export default function VoiceThreadHistory({
  messages,
}: VoiceThreadHistoryProps) {
  if (messages.length === 0) return null;

  // Show only the most recent messages
  const visible = messages.slice(-MAX_VISIBLE);

  return (
    <motion.div
      className="w-full max-w-2xl mx-auto space-y-1 overflow-y-auto max-h-64 scrollbar-thin px-1"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: motionDuration.base, ease: motionEase }}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 sticky top-0 bg-background/80 backdrop-blur-sm py-1">
        Conversation
      </p>
      {visible.map((message) => (
        <ChatMessageItem key={message.key} message={message} />
      ))}
    </motion.div>
  );
}
