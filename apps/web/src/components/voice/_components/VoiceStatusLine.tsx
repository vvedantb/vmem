/**
 * Transient status line beneath the Persona orb.
 * Shows a colored dot indicator, live phase feedback,
 * transcript preview, and error messages.
 */
"use client";

import { motion, AnimatePresence } from "motion/react";
import { motionDuration, motionEase } from "@vmem/ui";
import type { VoicePhase } from "@/components/contexts/VoiceContext";
import { AnimatedStatusDot } from "@/components/svg-animations";

interface VoiceStatusLineProps {
  phase: VoicePhase;
  transcript: string | null;
  replyText: string | null;
  errorMessage: string | null;
  allReady: boolean;
}

const PHASE_LABELS: Record<VoicePhase, string> = {
  idle: "Ready to listen",
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
  allReady,
}: VoiceStatusLineProps) {
  // Softer message when models aren't loaded yet
  if (!allReady) {
    return (
      <div className="flex flex-col items-center gap-1 min-h-[3rem]">
        <p className="text-sm text-muted/70">Load models to get started</p>
      </div>
    );
  }

  const label = PHASE_LABELS[phase];

  return (
    <div className="flex flex-col items-center gap-2 min-h-[3.5rem]">
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          className="flex items-center gap-2"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
        >
          {/* Animated status dot with glow and ripples */}
          <AnimatedStatusDot phase={phase} size={8} />
          <p className="text-sm font-medium text-foreground/80">
            {phase === "error" && errorMessage ? errorMessage : label}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Transcript preview while thinking / speaking */}
      {transcript && phase !== "idle" && (
        <motion.p
          className="text-xs text-muted/60 text-center max-w-xs truncate italic"
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
          className="text-xs text-foreground/70 text-center max-w-sm line-clamp-2"
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
