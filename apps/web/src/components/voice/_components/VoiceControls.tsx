/**
 * Push-to-talk mic button and cancel control for voice mode.
 * Large circular mic button with state-driven visual feedback.
 */
"use client";

import { IconX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import type { VoicePhase } from "@/components/contexts/VoiceContext";
import { MorphingMicIcon, PulsingRings } from "@/components/svg-animations";

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
      <div className="relative">
        <motion.button
          type="button"
          disabled={disabled || isProcessing}
          onClick={isListening ? onStopRecording : onStartRecording}
          className={cn(
            "relative flex items-center justify-center rounded-full size-20 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isListening
              ? "bg-red-500 text-white shadow-panel hover:bg-red-600"
              : "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90",
            disabled && !isProcessing && "opacity-40 cursor-not-allowed",
            isProcessing && "opacity-50 cursor-not-allowed",
          )}
          whileTap={disabled || isProcessing ? undefined : { scale: 0.93 }}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
          aria-label={isListening ? "Stop recording" : "Start recording"}
        >
          {/* Morphing mic/stop icon */}
          <MorphingMicIcon
            isListening={isListening}
            size={32}
            strokeWidth={2}
          />
        </motion.button>

        {/* Concentric pulsing rings while listening */}
        <PulsingRings size={80} ringCount={3} active={isListening} />
      </div>

      {/* Cancel button — visible during active session */}
      <AnimatePresence>
        {!isIdle && (
          <motion.button
            type="button"
            onClick={onCancel}
            className="flex items-center justify-center size-10 rounded-full text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: motionDuration.fast, ease: motionEase }}
            aria-label="Cancel"
          >
            <IconX className="size-5" stroke={1.5} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
