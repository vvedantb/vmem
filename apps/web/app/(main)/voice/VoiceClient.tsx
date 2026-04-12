/**
 * VoiceClient — thin orchestrator for the /voice route.
 *
 * Wires VoiceContext (mic / STT / TTS), WebLLM (local chat model),
 * and Convex (shared thread persistence) together.
 *
 * The Persona orb state is derived directly from VoicePhase.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { streamText } from "ai";
import { useUIMessages } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import { Persona, type PersonaState } from "@vmem/ui/ai";
import { useWebLLM } from "@/components/contexts/WebLLMContext";
import {
  useVoice,
  type VoicePhase,
  type VoiceReadiness,
} from "@/components/contexts/VoiceContext";
import { STT_MODELS, TTS_MODELS } from "@/lib/voice/voice-models";
import VoiceReadinessCard from "./_components/VoiceReadinessCard";
import VoiceControls from "./_components/VoiceControls";
import VoiceStatusLine from "./_components/VoiceStatusLine";
import VoiceThreadHistory from "./_components/VoiceThreadHistory";

/* ------------------------------------------------------------------ */
/*  Voice → Persona state mapping                                      */
/* ------------------------------------------------------------------ */

const PHASE_TO_PERSONA: Record<VoicePhase, PersonaState> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  error: "idle",
};

/* ------------------------------------------------------------------ */
/*  System prompt (same brain as /chat local mode)                     */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = [
  "You are vmem, a memory assistant that helps users store, search, and recall their personal memories.",
  "You are currently running locally in the user's browser with limited capabilities.",
  "You cannot search memories right now. Have a helpful general conversation.",
  "Be concise and helpful. Keep responses short since they will be spoken aloud.",
].join(" ");

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VoiceClient() {
  const { model, engineState, loadModel, activeModelId } = useWebLLM();
  const voice = useVoice();

  /* -- Thread setup ------------------------------------------------- */
  const [threadId, setThreadId] = useState<string | null>(null);
  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const saveLocalMessages = useMutation(api.chat.saveLocalMessages);

  useEffect(() => {
    getOrCreateThread()
      .then(setThreadId)
      .catch((err) => {
        console.error("Failed to get voice thread:", err);
      });
  }, [getOrCreateThread]);

  /* -- Thread messages (shared with /chat) -------------------------- */
  const { results: messages } = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  /* -- Readiness ---------------------------------------------------- */
  const readiness: VoiceReadiness = {
    llmReady: engineState === "ready" && model !== null,
    sttReady: voice.sttState === "ready",
    ttsReady: voice.ttsState === "ready",
  };

  const canRecord = readiness.llmReady && readiness.sttReady;

  /* -- LLM reply generator ----------------------------------------- */
  /**
   * Generate a reply using the local WebLLM model.
   * Builds conversation history from the shared thread
   * so the voice assistant has full context.
   */
  const generateReply = useCallback(
    async (transcript: string): Promise<string> => {
      if (!model) throw new Error("Local LLM not loaded");

      const history = messages
        .filter(
          (m): m is UIMessage & { role: "user" | "assistant" } =>
            m.status === "success" &&
            (m.role === "user" || m.role === "assistant"),
        )
        .map((m) => ({ role: m.role, content: m.text }));

      const { text } = await streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: [...history, { role: "user" as const, content: transcript }],
      });

      // For voice we consume the full text (no streaming UI needed)
      return text;
    },
    [model, messages],
  );

  /* -- Persist callback --------------------------------------------- */
  const handlePersist = useCallback(
    async (userText: string, assistantText: string) => {
      if (!threadId) return;
      await saveLocalMessages({
        threadId,
        userText,
        assistantText,
        source: "vmem-local-voice",
      });
    },
    [threadId, saveLocalMessages],
  );

  /* -- Recording handlers ------------------------------------------ */
  const handleStartRecording = useCallback(() => {
    voice.startRecording();
  }, [voice]);

  const handleStopRecording = useCallback(() => {
    voice.stopRecording(generateReply, handlePersist);
  }, [voice, generateReply, handlePersist]);

  /* -- Load helpers for readiness card ------------------------------ */
  const handleLoadLlm = useCallback(() => {
    if (activeModelId) {
      void loadModel(activeModelId);
    }
  }, [activeModelId, loadModel]);

  const handleLoadStt = useCallback(() => {
    const firstSTT = STT_MODELS[0];
    if (firstSTT) void voice.loadStt(firstSTT.id);
  }, [voice]);

  const handleLoadTts = useCallback(() => {
    const firstTTS = TTS_MODELS[0];
    if (firstTTS) void voice.loadTts(firstTTS.id);
  }, [voice]);

  /* -- Render ------------------------------------------------------- */
  const personaState = PHASE_TO_PERSONA[voice.phase];

  return (
    <div className="flex flex-col items-center h-full min-h-0 gap-6 py-6">
      {/* Readiness card — hidden once all three models are loaded */}
      <VoiceReadinessCard
        readiness={readiness}
        llmLoading={engineState === "loading"}
        sttLoading={voice.sttState === "loading"}
        ttsLoading={voice.ttsState === "loading"}
        onLoadLlm={activeModelId ? handleLoadLlm : undefined}
        onLoadStt={handleLoadStt}
        onLoadTts={handleLoadTts}
      />

      {/* Persona orb */}
      <div className="flex-shrink-0">
        <Persona state={personaState} variant="mana" className="size-40" />
      </div>

      {/* Status line */}
      <VoiceStatusLine
        phase={voice.phase}
        transcript={voice.transcript}
        replyText={voice.replyText}
        errorMessage={voice.errorMessage}
      />

      {/* Mic controls */}
      <VoiceControls
        phase={voice.phase}
        disabled={!canRecord}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onCancel={voice.cancelSession}
      />

      {/* Thread history */}
      <div className="flex-1 min-h-0 w-full overflow-y-auto">
        <VoiceThreadHistory messages={messages} />
      </div>
    </div>
  );
}
