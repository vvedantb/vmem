/**
 * VoiceContext — React context for browser-local voice mode.
 *
 * Manages:
 *  - Voice model readiness (STT + TTS load state)
 *  - Active speaker selection
 *  - Session phase (idle → listening → thinking → speaking → idle)
 *  - Transient transcript / assistant draft during a voice turn
 *  - Mic recording, STT, TTS playback orchestration
 *
 * Does NOT own message history — that stays in Convex via the shared thread.
 */
"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import {
  STT_MODELS,
  TTS_MODELS,
  getActiveSTTModelId,
  setActiveSTTModelId,
  getActiveTTSModelId,
  setActiveTTSModelId,
  getActiveSpeakerId,
  setActiveSpeakerId as persistSpeakerId,
  clearActiveSTTModelId,
  clearActiveTTSModelId,
  type STTVoiceModelInfo,
  type TTSVoiceModelInfo,
} from "@/lib/voice/voice-models";
import {
  loadSTT,
  unloadSTT,
  isSTTReady,
  isSTTLoading,
  transcribe,
  type STTProgressCallback,
} from "@/lib/voice/stt-engine";
import {
  loadTTS,
  unloadTTS,
  isTTSReady,
  isTTSLoading,
  synthesise,
  playAudio,
  type TTSProgressCallback,
} from "@/lib/voice/tts-engine";
import { startMicRecording, blobToFloat32 } from "@/lib/voice/voice-session";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type VoicePhase =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type VoiceModelLoadState = "idle" | "loading" | "ready" | "error";

export interface VoiceReadiness {
  llmReady: boolean;
  sttReady: boolean;
  ttsReady: boolean;
}

interface VoiceContextValue {
  /* -- model catalogs ------------------------------------------------ */
  sttModels: readonly STTVoiceModelInfo[];
  ttsModels: readonly TTSVoiceModelInfo[];

  /* -- STT state ----------------------------------------------------- */
  activeSTTModelId: string | null;
  sttState: VoiceModelLoadState;
  sttProgress: number | null;
  sttMessage: string | null;

  /* -- TTS state ----------------------------------------------------- */
  activeTTSModelId: string | null;
  ttsState: VoiceModelLoadState;
  ttsProgress: number | null;
  ttsMessage: string | null;
  activeSpeaker: string;

  /* -- session state ------------------------------------------------- */
  phase: VoicePhase;
  /** Transient user transcript (set after STT, before persist) */
  transcript: string | null;
  /** Transient assistant reply text (set after LLM, before persist) */
  replyText: string | null;
  /** Last error message */
  errorMessage: string | null;

  /* -- actions ------------------------------------------------------- */
  loadStt: (modelId: string) => Promise<void>;
  unloadStt: () => void;
  loadTts: (modelId: string) => Promise<void>;
  unloadTts: () => void;
  setSpeaker: (speakerId: string) => void;
  setActiveSTTModelId: (modelId: string) => void;
  setActiveTTSModelId: (modelId: string) => void;
  /** Play a short preview of a voice */
  previewVoice: (speakerId: string) => Promise<void>;
  /** Whether a voice preview is currently playing */
  isPreviewing: boolean;

  /**
   * Start a voice turn: record → transcribe → call LLM → TTS playback.
   *
   * `generateReply` is the callback that sends the transcript to the
   * local LLM and returns the assistant's text. The caller (VoiceClient)
   * provides this so the context stays decoupled from the LLM layer.
   *
   * `onPersist` is called once both user transcript and assistant reply
   * are ready, so the caller can save them to Convex.
   */
  startRecording: () => void;
  stopRecording: (
    generateReply: (transcript: string) => Promise<string>,
    onPersist: (userText: string, assistantText: string) => Promise<void>,
  ) => void;
  cancelSession: () => void;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const VoiceContext = createContext<VoiceContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function VoiceProvider({ children }: { children: ReactNode }) {
  /* -- STT ---------------------------------------------------------- */
  const [activeSTTId, setActiveSTTId] = useState<string | null>(null);
  const [sttState, setSttState] = useState<VoiceModelLoadState>("idle");
  const [sttProgress, setSttProgress] = useState<number | null>(null);
  const [sttMessage, setSttMessage] = useState<string | null>(null);

  /* -- TTS ---------------------------------------------------------- */
  const [activeTTSId, setActiveTTSId] = useState<string | null>(null);
  const [ttsState, setTtsState] = useState<VoiceModelLoadState>("idle");
  const [ttsProgress, setTtsProgress] = useState<number | null>(null);
  const [ttsMessage, setTtsMessage] = useState<string | null>(null);
  const [activeSpeaker, setActiveSpeakerState] = useState<string>("af_heart");

  /* -- Session ------------------------------------------------------ */
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  /* Refs for cancellation */
  const recordingRef = useRef<Awaited<
    ReturnType<typeof startMicRecording>
  > | null>(null);
  const playbackCancelRef = useRef<(() => void) | null>(null);
  const previewCancelRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);

  /* -- Hydrate from localStorage ------------------------------------- */
  useEffect(() => {
    const storedSTT = getActiveSTTModelId();
    if (storedSTT) setActiveSTTId(storedSTT);

    const storedTTS = getActiveTTSModelId();
    if (storedTTS) setActiveTTSId(storedTTS);

    const storedSpeaker = getActiveSpeakerId();
    if (storedSpeaker) setActiveSpeakerState(storedSpeaker);

    // Sync with engine state (in case engines were loaded before mount)
    if (isSTTReady()) setSttState("ready");
    if (isTTSReady()) setTtsState("ready");
  }, []);

  /* -- STT actions -------------------------------------------------- */
  const handleLoadStt = useCallback(async (modelId: string) => {
    if (isSTTLoading()) return;
    setSttState("loading");
    setSttProgress(0);
    setSttMessage("Initializing...");

    const onProgress: STTProgressCallback = ({ percent, message }) => {
      if (percent !== null) setSttProgress(percent);
      setSttMessage(message);
    };

    try {
      await loadSTT(modelId, onProgress);
      setSttState("ready");
      setSttProgress(100);
      setSttMessage(null);
      setActiveSTTModelId(modelId);
      setActiveSTTId(modelId);
    } catch (err) {
      setSttState("error");
      setSttProgress(null);
      setSttMessage(
        err instanceof Error ? err.message : "Failed to load STT model",
      );
    }
  }, []);

  const handleUnloadStt = useCallback(() => {
    unloadSTT();
    clearActiveSTTModelId();
    setActiveSTTId(null);
    setSttState("idle");
    setSttProgress(null);
    setSttMessage(null);
  }, []);

  /* -- TTS actions -------------------------------------------------- */
  const handleLoadTts = useCallback(async (modelId: string) => {
    if (isTTSLoading()) return;
    setTtsState("loading");
    setTtsProgress(0);
    setTtsMessage("Initializing...");

    const onProgress: TTSProgressCallback = ({ percent, message }) => {
      if (percent !== null) setTtsProgress(percent);
      setTtsMessage(message);
    };

    try {
      await loadTTS(modelId, onProgress);
      setTtsState("ready");
      setTtsProgress(100);
      setTtsMessage(null);
      setActiveTTSModelId(modelId);
      setActiveTTSId(modelId);
    } catch (err) {
      setTtsState("error");
      setTtsProgress(null);
      setTtsMessage(
        err instanceof Error ? err.message : "Failed to load TTS model",
      );
    }
  }, []);

  const handleUnloadTts = useCallback(() => {
    unloadTTS();
    clearActiveTTSModelId();
    setActiveTTSId(null);
    setTtsState("idle");
    setTtsProgress(null);
    setTtsMessage(null);
  }, []);

  /* -- Speaker ------------------------------------------------------ */
  const handleSetSpeaker = useCallback((speakerId: string) => {
    persistSpeakerId(speakerId);
    setActiveSpeakerState(speakerId);
  }, []);

  const PREVIEW_TEXT = "Hello! This is what I sound like.";

  const handlePreviewVoice = useCallback(
    async (speakerId: string) => {
      if (!isTTSReady() || isPreviewing) return;

      // Cancel any existing preview
      if (previewCancelRef.current) {
        previewCancelRef.current();
        previewCancelRef.current = null;
      }

      setIsPreviewing(true);
      try {
        const { audio, samplingRate } = await synthesise(
          PREVIEW_TEXT,
          speakerId,
        );
        const { done, cancel } = playAudio(audio, samplingRate);
        previewCancelRef.current = cancel;
        await done;
      } catch {
        // Preview failure is non-fatal
      } finally {
        setIsPreviewing(false);
        previewCancelRef.current = null;
      }
    },
    [isPreviewing],
  );

  /* -- Model ID setters (preference only, no load) ------------------ */
  const handleSetActiveSTTId = useCallback((modelId: string) => {
    setActiveSTTModelId(modelId);
    setActiveSTTId(modelId);
  }, []);

  const handleSetActiveTTSId = useCallback((modelId: string) => {
    setActiveTTSModelId(modelId);
    setActiveTTSId(modelId);
  }, []);

  /* -- Recording ---------------------------------------------------- */
  const handleStartRecording = useCallback(() => {
    if (phase !== "idle") return;

    cancelledRef.current = false;
    setTranscript(null);
    setReplyText(null);
    setErrorMessage(null);
    setPhase("listening");

    startMicRecording()
      .then((handle) => {
        if (cancelledRef.current) {
          handle.cancel();
          setPhase("idle");
          return;
        }
        recordingRef.current = handle;
      })
      .catch((err) => {
        setPhase("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Microphone access denied",
        );
      });
  }, [phase]);

  /**
   * Stop recording and run the full voice pipeline:
   * mic blob → STT → LLM → persist → TTS → playback.
   */
  const handleStopRecording = useCallback(
    (
      generateReply: (transcript: string) => Promise<string>,
      onPersist: (userText: string, assistantText: string) => Promise<void>,
    ) => {
      const recording = recordingRef.current;
      if (!recording) return;
      recordingRef.current = null;

      setPhase("thinking");

      recording
        .stop()
        .then(async (blob) => {
          if (cancelledRef.current) return;

          /* 1. Transcribe -------------------------------------------- */
          const pcm = await blobToFloat32(blob);
          const text = await transcribe(pcm);
          if (cancelledRef.current) return;
          if (!text.trim()) {
            setPhase("idle");
            setTranscript(null);
            return;
          }

          setTranscript(text);

          /* 2. LLM reply --------------------------------------------- */
          const reply = await generateReply(text);
          if (cancelledRef.current) return;
          setReplyText(reply);

          /* 3. Persist to Convex ------------------------------------- */
          await onPersist(text, reply);
          if (cancelledRef.current) return;

          /* 4. TTS synthesis + playback ------------------------------ */
          if (isTTSReady() && reply.trim()) {
            setPhase("speaking");
            try {
              const { audio, samplingRate } = await synthesise(
                reply,
                activeSpeaker,
              );
              if (cancelledRef.current) return;

              const { done, cancel } = playAudio(audio, samplingRate);
              playbackCancelRef.current = cancel;
              await done;
            } catch {
              // TTS failure is non-fatal — text reply is already saved
            }
          }

          if (!cancelledRef.current) {
            setPhase("idle");
          }
        })
        .catch((err) => {
          if (!cancelledRef.current) {
            setPhase("error");
            setErrorMessage(
              err instanceof Error ? err.message : "Voice processing failed",
            );
          }
        });
    },
    [activeSpeaker],
  );

  /* -- Cancel ------------------------------------------------------- */
  const handleCancel = useCallback(() => {
    cancelledRef.current = true;

    // Stop mic if still recording
    if (recordingRef.current) {
      recordingRef.current.cancel();
      recordingRef.current = null;
    }

    // Stop playback if speaking
    if (playbackCancelRef.current) {
      playbackCancelRef.current();
      playbackCancelRef.current = null;
    }

    setPhase("idle");
    setTranscript(null);
    setReplyText(null);
    setErrorMessage(null);
  }, []);

  /* -- Auto-load voice models when IDs are set ---------------------- */
  useEffect(() => {
    if (activeSTTId && sttState === "idle" && !isSTTReady()) {
      void handleLoadStt(activeSTTId);
    }
  }, [activeSTTId, sttState, handleLoadStt]);

  useEffect(() => {
    if (activeTTSId && ttsState === "idle" && !isTTSReady()) {
      void handleLoadTts(activeTTSId);
    }
  }, [activeTTSId, ttsState, handleLoadTts]);

  /* -- Context value ------------------------------------------------ */
  return (
    <VoiceContext.Provider
      value={{
        sttModels: STT_MODELS,
        ttsModels: TTS_MODELS,
        activeSTTModelId: activeSTTId,
        sttState,
        sttProgress,
        sttMessage,
        activeTTSModelId: activeTTSId,
        ttsState,
        ttsProgress,
        ttsMessage,
        activeSpeaker,
        phase,
        transcript,
        replyText,
        errorMessage,
        loadStt: handleLoadStt,
        unloadStt: handleUnloadStt,
        loadTts: handleLoadTts,
        unloadTts: handleUnloadTts,
        setSpeaker: handleSetSpeaker,
        setActiveSTTModelId: handleSetActiveSTTId,
        setActiveTTSModelId: handleSetActiveTTSId,
        startRecording: handleStartRecording,
        stopRecording: handleStopRecording,
        cancelSession: handleCancel,
        previewVoice: handlePreviewVoice,
        isPreviewing,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (ctx === null) {
    throw new Error("useVoice must be used within a VoiceProvider");
  }
  return ctx;
}
