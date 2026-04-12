/**
 * Transient status line beneath the Persona orb.
 * Shows live phase feedback, transcript preview, and error messages.
 */
"use client";

import { motion, AnimatePresence } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import type { VoicePhase } from "@/components/contexts/VoiceContext";

interface VoiceStatusLineProps {
  phase: VoicePhase;
  transcript: string | null;
  replyText: string | null;
  errorMessage: string | null;
}

const PHASE_LABELS: Record<VoicePhase, string> = {
  idle: "Press the mic to speak",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking...",
  error: "Something went wrong",
};

export default function VoiceStatusLine({
  phase,
  transcript,
  replyText,
  errorMessage,
}: VoiceStatusLineProps) {
  const label = PHASE_LABELS[phase];

  return (
    <div className="flex flex-col items-center gap-2 min-h-[3.5rem]">
      <AnimatePresence mode="wait">
        <motion.p
          key={phase}
          className="text-sm text-muted-foreground text-center"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
        >
          {phase === "error" && errorMessage ? errorMessage : label}
        </motion.p>
      </AnimatePresence>

      {/* Transcript preview while thinking / speaking */}
      {transcript && phase !== "idle" && (
        <motion.p
          className="text-xs text-muted-foreground/70 text-center max-w-sm truncate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
        >
          &ldquo;{transcript}&rdquo;
        </motion.p>
      )}

      {/* Reply preview while speaking */}
      {replyText && phase === "speaking" && (
        <motion.p
          className="text-xs text-foreground/80 text-center max-w-sm line-clamp-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: motionDuration.fast,
            ease: motionEase,
            delay: 0.1,
          }}
        >
          {replyText}
        </motion.p>
      )}
    </div>
  );
}
