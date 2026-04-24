/**
 * VoiceClient — thin orchestrator for the /voice route.
 *
 * Wires VoiceContext (mic / STT / TTS), WebLLM (local chat model),
 * and Convex (shared thread persistence) together.
 *
 * Layout: CSS Grid centers the orb cluster vertically.
 * The Persona orb is the hero — everything else serves it.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { streamText } from "ai";
import { AnimatePresence } from "motion/react";
import { useUIMessages } from "@convex-dev/agent/react";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import {
  VMEM_VOICE_CORE,
  buildMemoryRagAddition,
  composeSystemPrompt,
} from "@vmem/backend/memoryRagPrompt";
import type { ChatMemoryRef } from "@/hooks/useLocalChat";
import { Persona, type PersonaState } from "@vmem/ui/ai";
import { useLocalLLM } from "@/components/contexts/LocalLLMContext";
import {
  useVoice,
  type VoicePhase,
  type VoiceReadiness,
} from "@/components/contexts/VoiceContext";
import { STT_MODELS, TTS_MODELS } from "@/lib/voice/voice-models";
import VoiceReadinessOverlay from "./_components/VoiceReadinessOverlay";
import VoiceControls from "./_components/VoiceControls";
import VoiceStatusLine from "./_components/VoiceStatusLine";
import VoiceHistoryDrawer from "./_components/VoiceHistoryDrawer";

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

const RETRIEVE_LIMIT = 8;

function highestOrder(messages: UIMessage[]): number {
  return messages.reduce(
    (best, message) => (message.order > best ? message.order : best),
    -1,
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VoiceClient() {
  const { model, engineState, loadModel, activeModelId } = useLocalLLM();
  const voice = useVoice();
  const lastVoiceMemoryRefsRef = useRef<ChatMemoryRef[]>([]);

  /* -- Thread setup ------------------------------------------------- */
  const [threadId, setThreadId] = useState<string | null>(null);
  const getOrCreateThread = useMutation(api.chat.getOrCreateThread);
  const saveLocalMessages = useMutation(api.chat.saveLocalMessages);
  const retrieveMemories = useAction(api.memoryApi.retrieveMemories);

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

  const memoryRefsByMessageKey: Record<string, ChatMemoryRef[]> =
    useQuery(
      api.chat.getThreadMessageMemoryRefs,
      threadId ? { threadId } : "skip",
    ) ?? {};

  /* -- Readiness ---------------------------------------------------- */
  const readiness: VoiceReadiness = {
    llmReady: engineState === "ready" && model !== null,
    sttReady: voice.sttState === "ready",
    ttsReady: voice.ttsState === "ready",
  };

  const allReady =
    readiness.llmReady && readiness.sttReady && readiness.ttsReady;
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

      let memoryRefs: ChatMemoryRef[] = [];
      let systemPrompt = VMEM_VOICE_CORE;

      try {
        const retrieved = await retrieveMemories({
          query: transcript,
          limit: RETRIEVE_LIMIT,
        });
        memoryRefs = retrieved.memories.map((m) => ({
          id: m.id,
          title: m.title,
          trace: {
            score: m.trace.score,
            scoreBreakdown: m.trace.scoreBreakdown,
            reason: m.trace.reason,
          },
        }));
        const addition = buildMemoryRagAddition(
          retrieved.memories.map((m) => ({
            id: m.id,
            title: m.title,
            content: m.content,
            trace: { reason: m.trace.reason },
          })),
        );
        systemPrompt = composeSystemPrompt(VMEM_VOICE_CORE, addition);
      } catch (retrieveError) {
        console.error("retrieveMemories failed:", retrieveError);
      }

      lastVoiceMemoryRefsRef.current = memoryRefs;

      const history = messages
        .filter(
          (m): m is UIMessage & { role: "user" | "assistant" } =>
            m.status === "success" &&
            (m.role === "user" || m.role === "assistant"),
        )
        .map((m) => ({ role: m.role, content: m.text }));

      const { text } = await streamText({
        model,
        system: systemPrompt,
        messages: [...history, { role: "user" as const, content: transcript }],
      });

      return text;
    },
    [model, messages, retrieveMemories],
  );

  /* -- Persist callback --------------------------------------------- */
  const handlePersist = useCallback(
    async (userText: string, assistantText: string) => {
      if (!threadId) return;

      const refs = lastVoiceMemoryRefsRef.current;
      const maxOrder = highestOrder(messages);
      const assistantOrder = maxOrder + 2;
      const assistantStepOrder = 0;

      await saveLocalMessages({
        threadId,
        userText,
        assistantText,
        source: "vmem-local-voice",
        ...(refs.length > 0
          ? {
              memoryRefs: refs,
              assistantOrder,
              assistantStepOrder,
            }
          : {}),
      });
    },
    [threadId, saveLocalMessages, messages],
  );

  /* -- Recording handlers ------------------------------------------ */
  const handleStartRecording = useCallback(() => {
    voice.startRecording();
  }, [voice]);

  const handleStopRecording = useCallback(() => {
    voice.stopRecording(generateReply, handlePersist);
  }, [voice, generateReply, handlePersist]);

  /* -- Load helpers ------------------------------------------------- */
  const handleLoadAll = useCallback(() => {
    if (activeModelId && !readiness.llmReady && engineState !== "loading") {
      void loadModel(activeModelId);
    }
    if (!readiness.sttReady && voice.sttState !== "loading") {
      const firstSTT = STT_MODELS[0];
      if (firstSTT) void voice.loadStt(firstSTT.id);
    }
    if (!readiness.ttsReady && voice.ttsState !== "loading") {
      const firstTTS = TTS_MODELS[0];
      if (firstTTS) void voice.loadTts(firstTTS.id);
    }
  }, [activeModelId, readiness, engineState, loadModel, voice]);

  /* -- Render ------------------------------------------------------- */
  const personaState = PHASE_TO_PERSONA[voice.phase];

  return (
    <div className="relative grid h-full min-h-0 grid-rows-[1fr_auto_1fr]">
      {/* Top spacer — pushes content to center */}
      <div />

      {/* Center cluster — orb is the hero */}
      <div className="flex flex-col items-center gap-5">
        {/* Orb + readiness overlay */}
        <div className="relative flex-shrink-0">
          <Persona
            state={allReady ? personaState : "asleep"}
            variant="mana"
            className="size-40 sm:size-56"
          />

          {/* Readiness pills — fade out when all models are loaded */}
          <AnimatePresence>
            {!allReady && (
              <VoiceReadinessOverlay
                readiness={readiness}
                llmLoading={engineState === "loading"}
                sttLoading={voice.sttState === "loading"}
                ttsLoading={voice.ttsState === "loading"}
                onLoadAll={handleLoadAll}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Status line */}
        <VoiceStatusLine
          phase={voice.phase}
          transcript={voice.transcript}
          replyText={voice.replyText}
          errorMessage={voice.errorMessage}
          allReady={allReady}
        />

        {/* Mic controls */}
        <VoiceControls
          phase={voice.phase}
          disabled={!canRecord}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          onCancel={voice.cancelSession}
        />
      </div>

      {/* Bottom zone — drawer trigger anchored to bottom */}
      <div className="flex items-end justify-center pb-2">
        <VoiceHistoryDrawer
          messages={messages}
          memoryRefsByMessageKey={memoryRefsByMessageKey}
        />
      </div>
    </div>
  );
}
