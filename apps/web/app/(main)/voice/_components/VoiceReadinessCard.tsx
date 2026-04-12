/**
 * Compact card showing readiness of the three models needed for voice mode:
 * local chat LLM, STT (Whisper), and TTS (Kokoro).
 *
 * Renders inline CTA buttons to load missing models.
 */
"use client";

import {
  IconCheck,
  IconLoader2,
  IconX,
  IconCpu,
  IconMicrophone,
  IconWaveSine,
} from "@tabler/icons-react";
import { Button } from "@vmem/ui";
import type { VoiceReadiness } from "@/components/contexts/VoiceContext";

interface ReadinessRowProps {
  label: string;
  ready: boolean;
  loading: boolean;
  icon: React.ReactNode;
  onLoad?: () => void;
}

function ReadinessRow({
  label,
  ready,
  loading,
  icon,
  onLoad,
}: ReadinessRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span className={ready ? "text-foreground" : "text-muted-foreground"}>
          {label}
        </span>
      </div>
      {ready ? (
        <IconCheck className="h-4 w-4 text-emerald-500" stroke={2} />
      ) : loading ? (
        <IconLoader2 className="h-4 w-4 text-muted-foreground animate-spin" />
      ) : onLoad ? (
        <Button size="sm" variant="outline" onClick={onLoad}>
          Load
        </Button>
      ) : (
        <IconX className="h-4 w-4 text-muted-foreground/50" stroke={1.5} />
      )}
    </div>
  );
}

interface VoiceReadinessCardProps {
  readiness: VoiceReadiness;
  llmLoading: boolean;
  sttLoading: boolean;
  ttsLoading: boolean;
  onLoadLlm?: () => void;
  onLoadStt?: () => void;
  onLoadTts?: () => void;
}

export default function VoiceReadinessCard({
  readiness,
  llmLoading,
  sttLoading,
  ttsLoading,
  onLoadLlm,
  onLoadStt,
  onLoadTts,
}: VoiceReadinessCardProps) {
  const allReady =
    readiness.llmReady && readiness.sttReady && readiness.ttsReady;

  if (allReady) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Model readiness
      </p>
      <ReadinessRow
        label="Chat LLM"
        ready={readiness.llmReady}
        loading={llmLoading}
        icon={<IconCpu className="h-4 w-4 text-muted-foreground" />}
        onLoad={readiness.llmReady ? undefined : onLoadLlm}
      />
      <ReadinessRow
        label="Whisper STT"
        ready={readiness.sttReady}
        loading={sttLoading}
        icon={<IconMicrophone className="h-4 w-4 text-muted-foreground" />}
        onLoad={readiness.sttReady ? undefined : onLoadStt}
      />
      <ReadinessRow
        label="Kokoro TTS"
        ready={readiness.ttsReady}
        loading={ttsLoading}
        icon={<IconWaveSine className="h-4 w-4 text-muted-foreground" />}
        onLoad={readiness.ttsReady ? undefined : onLoadTts}
      />
    </div>
  );
}
