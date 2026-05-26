/**
 * Card for a single voice model (STT or TTS) in the Preferences page.
 * Shows model info, status badges, load/unload actions, and download progress.
 */
"use client";

import {
  IconDownload,
  IconPlayerStop,
  IconWaveSine,
  IconMicrophone,
  IconLoader2,
} from "@tabler/icons-react";
import { Button, Progress } from "@vmem/ui";
import type { VoiceModelInfo } from "@/lib/voice/voice-models";
import type { VoiceModelLoadState } from "@/components/contexts/VoiceContext";

interface VoiceModelCardProps {
  model: VoiceModelInfo;
  isLoaded: boolean;
  loadState: VoiceModelLoadState;
  loadProgress: number | null;
  loadMessage: string | null;
  onLoad: () => void;
  onUnload: () => void;
}

export default function VoiceModelCard({
  model,
  isLoaded,
  loadState,
  loadProgress,
  loadMessage,
  onLoad,
  onUnload,
}: VoiceModelCardProps) {
  const isLoading = loadState === "loading";
  const KindIcon = model.kind === "stt" ? IconMicrophone : IconWaveSine;

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg bg-surface-secondary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <KindIcon className="h-4 w-4 text-muted flex-shrink-0" />
            <h4 className="text-sm font-medium text-foreground">
              {model.name}
            </h4>
          </div>
          <p className="text-xs text-muted mt-1">{model.description}</p>
          <p className="mt-1.5 text-xs text-muted capitalize">
            {model.kind === "stt" ? "Speech-to-Text" : "Text-to-Speech"}
          </p>
        </div>

        <div className="flex-shrink-0">
          {isLoaded ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onUnload}
              disabled={isLoading}
            >
              <IconPlayerStop className="h-3.5 w-3.5 mr-1.5" />
              Unload
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onLoad}
              disabled={isLoading}
              className="group overflow-hidden transition-[transform,background-color,opacity] duration-200"
            >
              {isLoading ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : (
                <IconDownload className="h-3.5 w-3.5" />
              )}
              <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-200 group-hover:max-w-24 group-hover:opacity-100 group-hover:ml-1.5">
                {isLoading ? "Loading..." : "Load"}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Loading progress bar */}
      {isLoading && loadProgress !== null && (
        <div className="space-y-1.5">
          <Progress value={loadProgress} className="h-1.5" />
          {loadMessage && (
            <p className="text-xs text-muted truncate">{loadMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
