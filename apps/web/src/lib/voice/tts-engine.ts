/**
 * TTS engine — browser-local text-to-speech via Kokoro-82M ONNX.
 *
 * Uses the `kokoro-js` library which wraps Transformers.js internally
 * to load and run the Kokoro TTS model.
 * Produces raw PCM audio that can be played via the Web Audio API.
 */

import type { ProgressCallback } from "@huggingface/transformers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TTSResult {
  /** Raw PCM audio samples */
  audio: Float32Array;
  /** Sample rate of the output audio */
  samplingRate: number;
}

export type TTSProgressCallback = (progress: {
  percent: number | null;
  message: string;
}) => void;

/**
 * Wrapped generate function that accepts a plain string voice id.
 * Internally calls KokoroTTS.generate with the typed voice parameter.
 */
type GenerateFn = (
  text: string,
  voice?: string,
) => Promise<{ data: Float32Array; sampling_rate: number }>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Merge multiple Float32Array chunks into one contiguous array. */
function mergeFloat32Arrays(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/* ------------------------------------------------------------------ */
/*  Singleton state                                                    */
/* ------------------------------------------------------------------ */

let generateFn: GenerateFn | null = null;
let loadedModelId: string | null = null;
let loading = false;

/* ------------------------------------------------------------------ */
/*  Progress helper                                                    */
/* ------------------------------------------------------------------ */

function isDownloadProgress(
  info: Record<string, unknown>,
): info is Record<string, unknown> & { progress: number } {
  return info.status === "progress" && typeof info.progress === "number";
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Download and initialise the Kokoro TTS model.
 * Safe to call multiple times — returns immediately if already loaded.
 */
export async function loadTTS(
  modelId: string,
  onProgress?: TTSProgressCallback,
): Promise<void> {
  if (generateFn && loadedModelId === modelId) return;
  if (loading) return;

  loading = true;
  onProgress?.({ percent: 0, message: "Loading text-to-speech model..." });

  try {
    // Dynamic import keeps kokoro-js out of the main bundle
    const { KokoroTTS } = await import("kokoro-js");

    const progressCallback: ProgressCallback = (
      info: Record<string, unknown>,
    ) => {
      if (isDownloadProgress(info)) {
        const pct = Math.round(info.progress);
        onProgress?.({ percent: pct, message: `Downloading: ${pct}%` });
      }
      if (info.status === "ready") {
        onProgress?.({ percent: 100, message: "Ready" });
      }
    };

    const tts = await KokoroTTS.from_pretrained(modelId, {
      dtype: "q8",
      device: null, // auto-detect best device
      progress_callback: progressCallback,
    });

    // Wrap generate() so callers pass a plain string voice id.
    // KokoroTTS.generate types `voice` as a strict union of known
    // speaker ids; the wrapper bridges that so VoiceContext can pass
    // any string from localStorage. kokoro-js validates at runtime.
    const voices = tts.voices;
    generateFn = async (text: string, voice?: string) => {
      // Call generate without voice option first, then conditionally
      // with voice if it's a known speaker. This avoids fighting
      // the strict `keyof typeof VOICES` union in kokoro-js types.
      let audio: Awaited<ReturnType<typeof tts.generate>>;
      if (voice && voice in voices) {
        // Voice is validated against the known voices object,
        // so the runtime accepts it even though TS can't narrow string → union.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        audio = await (tts.generate as Function)(text, { voice });
      } else {
        audio = await tts.generate(text);
      }
      // RawAudio.audio is Float32Array | Float32Array[]. The .data getter
      // merges chunks, but TS doesn't see it. Access .audio and merge manually.
      const pcm = Array.isArray(audio.audio)
        ? mergeFloat32Arrays(audio.audio)
        : audio.audio;
      return { data: pcm, sampling_rate: audio.sampling_rate };
    };
    loadedModelId = modelId;
  } finally {
    loading = false;
  }
}

/**
 * Synthesise speech from text.
 *
 * Returns raw PCM audio and the sample rate.
 * Use `playAudio()` to play the result.
 */
export async function synthesise(
  text: string,
  speakerId?: string,
): Promise<TTSResult> {
  if (!generateFn) {
    throw new Error("TTS engine not loaded — call loadTTS() first");
  }

  const result = await generateFn(text, speakerId);

  return {
    audio: result.data,
    samplingRate: result.sampling_rate,
  };
}

/**
 * Play raw PCM audio through the Web Audio API.
 * Returns a promise that resolves when playback completes.
 * The returned `cancel` function stops playback immediately.
 */
export function playAudio(
  audio: Float32Array,
  samplingRate: number,
): { done: Promise<void>; cancel: () => void } {
  const ctx = new AudioContext({ sampleRate: samplingRate });
  const buffer = ctx.createBuffer(1, audio.length, samplingRate);

  // Copy samples into the AudioBuffer channel
  const channelData = buffer.getChannelData(0);
  channelData.set(audio);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();

  let cancelled = false;

  const done = new Promise<void>((resolve) => {
    source.onended = () => {
      if (!cancelled) {
        void ctx.close();
      }
      resolve();
    };
  });

  const cancel = () => {
    cancelled = true;
    try {
      source.stop();
      void ctx.close();
    } catch {
      // source may already be stopped
    }
  };

  return { done, cancel };
}

/**
 * Free the loaded model from memory.
 */
export function unloadTTS(): void {
  generateFn = null;
  loadedModelId = null;
}

/**
 * Check if the TTS engine is loaded and ready.
 */
export function isTTSReady(): boolean {
  return generateFn !== null;
}

/**
 * Get the currently loaded TTS model id, or null.
 */
export function getLoadedTTSModelId(): string | null {
  return loadedModelId;
}

/**
 * Check if the TTS engine is currently loading.
 */
export function isTTSLoading(): boolean {
  return loading;
}
