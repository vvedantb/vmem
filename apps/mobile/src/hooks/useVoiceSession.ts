import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Speech from "expo-speech";
import { streamText } from "ai";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@vmem/backend";
import { VMEM_VOICE_CORE } from "@vmem/shared";
import { buildGroundedPrompt } from "@/lib/memory-grounding";
import { getLocalModel } from "@/services/llm-context";
import {
  checkModelStatus,
  getActiveModelIdOrDefault,
} from "@/services/model-manager";

/** Same phases as web VoiceContext. */
export type VoicePhase =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type LlmLoadState = "idle" | "loading" | "ready" | "error";

export interface VoiceReadiness {
  llmReady: boolean;
  sttReady: boolean;
  ttsReady: boolean;
}

/** Conservative fallback when the platform doesn't report a TTS input limit. */
const FALLBACK_SPEECH_MAX = 3500;

/** Split a long reply into sentence-aligned chunks under the TTS input limit. */
function chunkForSpeech(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence.length > maxLen ? sentence.slice(0, maxLen) : sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function highestOrder(messages: UIMessage[]): number {
  return messages.reduce(
    (best, message) => (message.order > best ? message.order : best),
    -1,
  );
}

interface VoiceSessionArgs {
  threadId: string | null;
  /** Shared thread history (provides LLM context + the next assistant order). */
  messages: UIMessage[];
}

/**
 * Voice turn state machine — mobile port of web's VoiceContext pipeline:
 * mic (OS STT) → grounded local-LLM reply → persist to the shared thread →
 * TTS playback (expo-speech). Cancellation is cooperative: llama generation
 * can't abort mid-stream, so `cancelledRef` discards results after each await.
 */
export function useVoiceSession({ threadId, messages }: VoiceSessionArgs) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [llmState, setLlmState] = useState<LlmLoadState>("idle");
  const [modelOnDisk, setModelOnDisk] = useState(true);
  const [sttGranted, setSttGranted] = useState(false);

  const cancelledRef = useRef(false);
  const phaseRef = useRef<VoicePhase>("idle");
  const finalTranscriptRef = useRef<string | null>(null);
  const interimTranscriptRef = useRef<string | null>(null);
  const pipelineStartedRef = useRef(false);
  const messagesRef = useRef<UIMessage[]>(messages);
  messagesRef.current = messages;

  const saveLocalMessages = useMutation(api.chat.saveLocalMessages);
  const retrieveMemories = useAction(api.memoryApi.retrieveMemories);
  const mySkills = useQuery(api.skills.listMy) ?? [];
  const skillsRef = useRef(mySkills);
  skillsRef.current = mySkills;

  const updatePhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /* -- Readiness ----------------------------------------------------- */
  const refreshReadiness = useCallback(async () => {
    const modelId = await getActiveModelIdOrDefault();
    const status = await checkModelStatus(modelId);
    setModelOnDisk(status.state === "ready");
    const permission = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    setSttGranted(permission.granted);
  }, []);

  useEffect(() => {
    void refreshReadiness();
  }, [refreshReadiness]);

  const loadAll = useCallback(async () => {
    // STT: OS-native, just needs the mic permission.
    const permission =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    setSttGranted(permission.granted);

    // LLM: load the on-disk GGUF into memory.
    if (llmState === "loading" || llmState === "ready") return;
    const modelId = await getActiveModelIdOrDefault();
    const status = await checkModelStatus(modelId);
    if (status.state !== "ready") {
      setModelOnDisk(false);
      return;
    }
    setModelOnDisk(true);
    setLlmState("loading");
    const model = await getLocalModel();
    setLlmState(model !== null ? "ready" : "error");
  }, [llmState]);

  const readiness: VoiceReadiness = {
    llmReady: llmState === "ready",
    sttReady: sttGranted,
    // OS speech engine — nothing to download.
    ttsReady: true,
  };

  /* -- TTS ------------------------------------------------------------ */
  const speakReply = useCallback(
    (reply: string) => {
      const maxLen = Speech.maxSpeechInputLength || FALLBACK_SPEECH_MAX;
      const chunks = chunkForSpeech(reply, maxLen);
      updatePhase("speaking");
      Speech.stop();
      chunks.forEach((chunk, index) => {
        const isLast = index === chunks.length - 1;
        // expo-speech queues sequential speak() calls natively.
        Speech.speak(chunk, {
          ...(isLast
            ? {
                onDone: () => updatePhase("idle"),
                onStopped: () => updatePhase("idle"),
                onError: () => updatePhase("idle"),
              }
            : {}),
        });
      });
    },
    [updatePhase],
  );

  /* -- Pipeline: transcript → LLM → persist → TTS --------------------- */
  const runPipeline = useCallback(async () => {
    if (pipelineStartedRef.current) return;
    pipelineStartedRef.current = true;

    const text = (
      finalTranscriptRef.current ??
      interimTranscriptRef.current ??
      ""
    ).trim();
    if (!text) {
      setTranscript(null);
      updatePhase("idle");
      return;
    }
    setTranscript(text);
    updatePhase("thinking");

    try {
      const model = await getLocalModel();
      if (!model) throw new Error("Local model not loaded");
      if (cancelledRef.current) return;

      const grounded = await buildGroundedPrompt({
        core: VMEM_VOICE_CORE,
        query: text,
        skills: skillsRef.current.map((skill) => ({
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          enabled: skill.enabled,
        })),
        retrieve: retrieveMemories,
      });
      if (cancelledRef.current) return;

      const history = messagesRef.current
        .filter(
          (m): m is UIMessage & { role: "user" | "assistant" } =>
            m.status === "success" &&
            (m.role === "user" || m.role === "assistant"),
        )
        .map((m) => ({ role: m.role, content: m.text }));

      const result = streamText({
        model,
        system: grounded.systemPrompt,
        messages: [...history, { role: "user", content: text }],
      });
      const reply = await result.text;
      if (cancelledRef.current) return;
      setReplyText(reply);

      // Persist BEFORE TTS so cancelling playback never loses the turn.
      if (threadId && reply.trim()) {
        const assistantOrder = highestOrder(messagesRef.current) + 2;
        await saveLocalMessages({
          threadId,
          userText: text,
          assistantText: reply,
          source: "vmem-local-voice",
          ...(grounded.memoryRefs.length > 0
            ? {
                memoryRefs: grounded.memoryRefs,
                assistantOrder,
                assistantStepOrder: 0,
              }
            : {}),
        });
      }
      if (cancelledRef.current) return;

      if (reply.trim()) {
        speakReply(reply);
      } else {
        updatePhase("idle");
      }
    } catch (err) {
      if (!cancelledRef.current) {
        updatePhase("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Voice processing failed",
        );
      }
    }
  }, [retrieveMemories, saveLocalMessages, speakReply, threadId, updatePhase]);

  /* -- Speech recognition events -------------------------------------- */
  useSpeechRecognitionEvent("result", (event) => {
    const lastResult = event.results[event.results.length - 1];
    if (!lastResult?.transcript) return;
    interimTranscriptRef.current = lastResult.transcript;
    if (event.isFinal) {
      finalTranscriptRef.current = lastResult.transcript;
    }
    if (phaseRef.current === "listening") {
      setTranscript(lastResult.transcript);
    }
  });

  useSpeechRecognitionEvent("end", () => {
    if (cancelledRef.current) return;
    // Fires after stop() AND when the OS auto-ends on silence — both proceed.
    if (phaseRef.current === "listening") {
      void runPipeline();
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (cancelledRef.current) return;
    if (phaseRef.current !== "listening") return;
    if (event.error === "no-speech") {
      setTranscript(null);
      updatePhase("idle");
      return;
    }
    updatePhase("error");
    setErrorMessage(event.message || "Speech recognition failed");
  });

  /* -- Controls -------------------------------------------------------- */
  const startRecording = useCallback(async () => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "error") return;

    cancelledRef.current = false;
    pipelineStartedRef.current = false;
    finalTranscriptRef.current = null;
    interimTranscriptRef.current = null;
    setTranscript(null);
    setReplyText(null);
    setErrorMessage(null);

    const permission =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    setSttGranted(permission.granted);
    if (!permission.granted) {
      updatePhase("error");
      setErrorMessage("Microphone access denied");
      return;
    }

    updatePhase("listening");
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: false,
    });
  }, [updatePhase]);

  const stopRecording = useCallback(() => {
    if (phaseRef.current !== "listening") return;
    // Keep phase "listening" — the final result + end events complete the
    // turn via runPipeline (which flips to thinking). Fallback below covers
    // platforms where end never fires.
    ExpoSpeechRecognitionModule.stop();
    setTimeout(() => {
      if (
        !cancelledRef.current &&
        !pipelineStartedRef.current &&
        phaseRef.current === "listening"
      ) {
        void runPipeline();
      }
    }, 3000);
  }, [runPipeline]);

  const cancelSession = useCallback(() => {
    cancelledRef.current = true;
    ExpoSpeechRecognitionModule.abort();
    Speech.stop();
    setTranscript(null);
    setReplyText(null);
    setErrorMessage(null);
    updatePhase("idle");
  }, [updatePhase]);

  return {
    phase,
    transcript,
    replyText,
    errorMessage,
    readiness,
    llmState,
    modelOnDisk,
    loadAll,
    refreshReadiness,
    startRecording,
    stopRecording,
    cancelSession,
  };
}
