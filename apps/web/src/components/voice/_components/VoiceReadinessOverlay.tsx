/**
 * Inline readiness indicator — compact pills below the Persona orb
 * showing LLM / STT / TTS status with a one-click "Load All" button.
 * Fades out via AnimatePresence in the parent when all models are ready.
 */
"use client";

import {
  IconCheck,
  IconCpu,
  IconMicrophone,
  IconWaveSine,
  IconPlayerPlay,
  IconLoader2,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";
import { Button } from "@vmem/ui";
import type { VoiceReadiness } from "@/components/contexts/VoiceContext";

/* ------------------------------------------------------------------ */
/*  Readiness pill                                                     */
/* ------------------------------------------------------------------ */

interface ReadinessPillProps {
  label: string;
  ready: boolean;
  loading: boolean;
  icon: React.ReactNode;
}

function ReadinessPill({ label, ready, loading, icon }: ReadinessPillProps) {
  return (
    <motion.div
      layout
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        ready
          ? "border border-success/25 bg-success/10 text-success"
          : loading
            ? "border border-border/50 bg-surface-secondary/40 text-muted"
            : "border border-border/40 bg-surface-secondary/30 text-muted/70",
      )}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      {ready ? (
        <IconCheck className="size-3.5" stroke={2} />
      ) : loading ? (
        <IconLoader2 size={14} className="animate-spin" />
      ) : (
        icon
      )}
      <span>{label}</span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Overlay                                                            */
/* ------------------------------------------------------------------ */

interface VoiceReadinessOverlayProps {
  readiness: VoiceReadiness;
  llmLoading: boolean;
  sttLoading: boolean;
  ttsLoading: boolean;
  onLoadAll: () => void;
}

export default function VoiceReadinessOverlay({
  readiness,
  llmLoading,
  sttLoading,
  ttsLoading,
  onLoadAll,
}: VoiceReadinessOverlayProps) {
  const anyLoading = llmLoading || sttLoading || ttsLoading;

  return (
    <motion.div
      className="mt-6 flex flex-col items-center gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: motionDuration.base, ease: motionEase }}
    >
      {/* Readiness pills */}
      <div className="flex items-center gap-2">
        <ReadinessPill
          label="LLM"
          ready={readiness.llmReady}
          loading={llmLoading}
          icon={<IconCpu className="size-3.5" />}
        />
        <ReadinessPill
          label="STT"
          ready={readiness.sttReady}
          loading={sttLoading}
          icon={<IconMicrophone className="size-3.5" />}
        />
        <ReadinessPill
          label="TTS"
          ready={readiness.ttsReady}
          loading={ttsLoading}
          icon={<IconWaveSine className="size-3.5" />}
        />
      </div>

      {/* Load All button — only when not everything is already loading */}
      {!anyLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: motionDuration.fast }}
        >
          <Button size="sm" onClick={onLoadAll}>
            <IconPlayerPlay className="size-3.5" stroke={2} />
            Load All Models
          </Button>
        </motion.div>
      )}

      {anyLoading && (
        <p className="text-xs text-muted">
          Loading models, this may take a moment...
        </p>
      )}
    </motion.div>
  );
}
