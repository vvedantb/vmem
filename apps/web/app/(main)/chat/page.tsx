"use client";

import { motion } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import Chat from "@/components/Chat";

export default function ChatPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-5 flex-shrink-0 min-h-10">
        <motion.h2
          className="text-2xl leading-tight font-instrumentSerif text-foreground"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
        >
          Chat
        </motion.h2>
      </div>
      <motion.div
        className="min-h-0 flex-1 overflow-hidden"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: motionDuration.base,
          ease: motionEase,
          delay: 0.12,
        }}
      >
        <Chat />
      </motion.div>
    </div>
  );
}
