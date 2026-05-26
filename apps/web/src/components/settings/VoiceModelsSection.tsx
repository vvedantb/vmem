/**
 * Settings section for managing local voice models (STT + TTS).
 * Mirrors the LocalModelsSection pattern for text LLMs.
 */
"use client";

import { useCallback } from "react";
import { IconInfoCircle, IconPlayerPlay } from "@tabler/icons-react";
import { useVoice } from "@/components/contexts/VoiceContext";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
} from "@vmem/ui";
import {
  KOKORO_SPEAKERS,
  type KokoroSpeakerId,
} from "@/lib/voice/voice-models";
import VoiceModelCard from "./VoiceModelCard";

export default function VoiceModelsSection() {
  const {
    sttModels,
    ttsModels,
    sttState,
    sttProgress,
    sttMessage,
    ttsState,
    ttsProgress,
    ttsMessage,
    activeSpeaker,
    loadStt,
    unloadStt,
    loadTts,
    unloadTts,
    setSpeaker,
    previewVoice,
    isPreviewing,
  } = useVoice();

  const handleLoadStt = useCallback(
    (modelId: string) => {
      void loadStt(modelId);
    },
    [loadStt],
  );

  const handleLoadTts = useCallback(
    (modelId: string) => {
      void loadTts(modelId);
    },
    [loadTts],
  );

  const sttReady = sttState === "ready";
  const ttsReady = ttsState === "ready";

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 bg-surface-secondary/40 rounded-lg p-3">
        <IconInfoCircle className="h-4 w-4 text-muted flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted">
          Voice models run entirely in your browser. Whisper handles speech
          recognition, Kokoro handles text-to-speech. Both are required for the
          full voice experience on the /voice page.
        </p>
      </div>

      {/* STT models */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">
          Speech Recognition (STT)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sttModels.map((model) => (
            <VoiceModelCard
              key={model.id}
              model={model}
              isLoaded={sttReady}
              loadState={sttState}
              loadProgress={sttProgress}
              loadMessage={sttMessage}
              onLoad={() => handleLoadStt(model.id)}
              onUnload={unloadStt}
            />
          ))}
        </div>
      </div>

      {/* TTS models */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">
          Text-to-Speech (TTS)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ttsModels.map((model) => (
            <VoiceModelCard
              key={model.id}
              model={model}
              isLoaded={ttsReady}
              loadState={ttsState}
              loadProgress={ttsProgress}
              loadMessage={ttsMessage}
              onLoad={() => handleLoadTts(model.id)}
              onUnload={unloadTts}
            />
          ))}
        </div>
      </div>

      {/* Speaker selection (only relevant when TTS is loaded) */}
      {ttsReady && (
        <div className="space-y-2">
          <Label htmlFor="speaker-select" className="text-sm font-medium">
            Voice
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={activeSpeaker} onValueChange={setSpeaker}>
              <SelectTrigger id="speaker-select" className="w-60">
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                {KOKORO_SPEAKERS.map((speaker) => (
                  <SelectItem key={speaker} value={speaker}>
                    {formatSpeakerName(speaker)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={isPreviewing}
              onClick={() => {
                void previewVoice(activeSpeaker);
              }}
            >
              <IconPlayerPlay className="h-3.5 w-3.5" aria-hidden />
              Preview
            </Button>
          </div>
          <p className="text-xs text-muted">
            Choose the voice used for spoken replies.
          </p>
        </div>
      )}

      {/* Error states */}
      {sttState === "error" && sttMessage && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
          <p className="text-xs text-danger">STT: {sttMessage}</p>
        </div>
      )}
      {ttsState === "error" && ttsMessage && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
          <p className="text-xs text-danger">TTS: {ttsMessage}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Turn "af_heart" → "Heart (Female)" etc.
 */
function formatSpeakerName(speakerId: KokoroSpeakerId): string {
  const gender = speakerId.startsWith("af_") ? "Female" : "Male";
  const rawName = speakerId.replace(/^a[fm]_/, "");
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  return `${name} (${gender})`;
}
