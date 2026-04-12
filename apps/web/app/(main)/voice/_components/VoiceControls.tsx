/**
 * Push-to-talk mic button and cancel control for voice mode.
 * Renders a large circular mic button that changes state based on VoicePhase.
 */
"use client";

import { IconMicrophone, IconPlayerStop, IconX } from "@tabler/icons-react";
import { motion } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import type { VoicePhase } from "@/components/contexts/VoiceContext";

interface VoiceControlsProps {
  phase: VoicePhase;
  disabled: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancel: () => void;
}

export default function VoiceControls({
  phase,
  disabled,
  onStartRecording,
  onStopRecording,
  onCancel,
}: VoiceControlsProps) {
  const isListening = phase === "listening";
  const isProcessing = phase === "thinking" || phase === "speaking";
  const isIdle = phase === "idle" || phase === "error";

  return (
    <div className="flex items-center gap-4">
      {/* Main mic / stop button */}
      <motion.button
        type="button"
        disabled={disabled || isProcessing}
        onClick={isListening ? onStopRecording : onStartRecording}
        className={cn(
          "relative flex items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "size-16",
          isListening
            ? "bg-red-500 text-white hover:bg-red-600"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
          (disabled || isProcessing) && "opacity-50 cursor-not-allowed",
        )}
        whileTap={disabled || isProcessing ? undefined : { scale: 0.93 }}
        transition={{ duration: motionDuration.fast, ease: motionEase }}
        aria-label={isListening ? "Stop recording" : "Start recording"}
      >
        {isListening ? (
          <IconPlayerStop className="size-7" stroke={2} />
        ) : (
          <IconMicrophone className="size-7" stroke={2} />
        )}

        {/* Pulsing ring while listening */}
        {isListening && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-red-400"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.35, opacity: 0 }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        )}
      </motion.button>

      {/* Cancel button — visible during listening/thinking/speaking */}
      {!isIdle && (
        <motion.button
          type="button"
          onClick={onCancel}
          className="flex items-center justify-center size-10 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          aria-label="Cancel"
        >
          <IconX className="size-5" stroke={1.5} />
        </motion.button>
      )}
    </div>
  );
}
