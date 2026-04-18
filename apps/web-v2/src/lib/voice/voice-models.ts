/**
 * Voice model catalog — registry for browser-local STT and TTS models.
 *
 * Separate from the WebLLM text-model catalog. Selections are persisted
 * in localStorage so they survive page reloads.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type VoiceModelKind = "stt" | "tts";

export interface VoiceModelInfo {
  /** Unique model identifier (HuggingFace repo id) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Approximate download size */
  size: string;
  /** Short description */
  description: string;
  kind: VoiceModelKind;
}

export interface TTSVoiceModelInfo extends VoiceModelInfo {
  kind: "tts";
  /** Available speaker preset ids */
  speakers: readonly string[];
  /** Default speaker id */
  defaultSpeaker: string;
}

export interface STTVoiceModelInfo extends VoiceModelInfo {
  kind: "stt";
}

/* ------------------------------------------------------------------ */
/*  STT models                                                         */
/* ------------------------------------------------------------------ */

export const STT_MODELS: readonly STTVoiceModelInfo[] = [
  {
    id: "onnx-community/whisper-base",
    name: "Whisper Base",
    size: "~145 MB",
    description: "OpenAI Whisper base — solid accuracy, fast browser inference",
    kind: "stt",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  TTS models                                                         */
/* ------------------------------------------------------------------ */

/**
 * Kokoro-82M speaker presets.
 * Full list at https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
 */
export const KOKORO_SPEAKERS = [
  "af_heart",
  "af_alloy",
  "af_aoede",
  "af_bella",
  "af_jessica",
  "af_kore",
  "af_nicole",
  "af_nova",
  "af_river",
  "af_sarah",
  "af_sky",
  "am_adam",
  "am_echo",
  "am_eric",
  "am_liam",
  "am_michael",
  "am_onyx",
] as const;

export type KokoroSpeakerId = (typeof KOKORO_SPEAKERS)[number];

export const TTS_MODELS: readonly TTSVoiceModelInfo[] = [
  {
    id: "onnx-community/Kokoro-82M-v1.0-ONNX",
    name: "Kokoro 82M",
    size: "~330 MB",
    description: "Lightweight, natural-sounding text-to-speech with 17 voices",
    kind: "tts",
    speakers: KOKORO_SPEAKERS,
    defaultSpeaker: "af_heart",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Lookup helpers                                                     */
/* ------------------------------------------------------------------ */

export function findSTTModel(modelId: string): STTVoiceModelInfo | undefined {
  return STT_MODELS.find((m) => m.id === modelId);
}

export function findTTSModel(modelId: string): TTSVoiceModelInfo | undefined {
  return TTS_MODELS.find((m) => m.id === modelId);
}

/* ------------------------------------------------------------------ */
/*  localStorage persistence                                           */
/* ------------------------------------------------------------------ */

const STT_MODEL_KEY = "vmem:activeSTTModelId";
const TTS_MODEL_KEY = "vmem:activeTTSModelId";
const TTS_SPEAKER_KEY = "vmem:activeTTSSpeaker";

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

/* -- STT ----------------------------------------------------------- */

export function getActiveSTTModelId(): string | null {
  const stored = safeGet(STT_MODEL_KEY);
  if (stored && STT_MODELS.some((m) => m.id === stored)) return stored;
  if (stored) safeRemove(STT_MODEL_KEY);
  return null;
}

export function setActiveSTTModelId(modelId: string): void {
  safeSet(STT_MODEL_KEY, modelId);
}

export function clearActiveSTTModelId(): void {
  safeRemove(STT_MODEL_KEY);
}

/* -- TTS ----------------------------------------------------------- */

export function getActiveTTSModelId(): string | null {
  const stored = safeGet(TTS_MODEL_KEY);
  if (stored && TTS_MODELS.some((m) => m.id === stored)) return stored;
  if (stored) safeRemove(TTS_MODEL_KEY);
  return null;
}

export function setActiveTTSModelId(modelId: string): void {
  safeSet(TTS_MODEL_KEY, modelId);
}

export function clearActiveTTSModelId(): void {
  safeRemove(TTS_MODEL_KEY);
}

/* -- Speaker ------------------------------------------------------- */

function isKokoroSpeaker(value: string): value is KokoroSpeakerId {
  return (KOKORO_SPEAKERS as readonly string[]).includes(value);
}

export function getActiveSpeakerId(): string | null {
  const stored = safeGet(TTS_SPEAKER_KEY);
  if (stored && isKokoroSpeaker(stored)) {
    return stored;
  }
  if (stored) safeRemove(TTS_SPEAKER_KEY);
  return null;
}

export function setActiveSpeakerId(speakerId: string): void {
  safeSet(TTS_SPEAKER_KEY, speakerId);
}

export function clearActiveSpeakerId(): void {
  safeRemove(TTS_SPEAKER_KEY);
}
