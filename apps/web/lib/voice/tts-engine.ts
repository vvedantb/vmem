/**
 * TTS engine — browser-local text-to-speech via Kokoro-82M ONNX.
 *
 * Uses Transformers.js to load and run the Kokoro TTS model.
 * Produces raw PCM audio that can be played via the Web Audio API.
 */

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
 * Minimal callable shape for the TTS pipeline.
 * Defined locally because the Transformers.js generic `Pipeline` union
 * doesn't narrow cleanly from `createPipeline("text-to-speech", …)`.
 */
interface TTSPipeline {
  (
    text: string,
    options?: Record<string, string>,
  ): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

/* ------------------------------------------------------------------ */
/*  Singleton state                                                    */
/* ------------------------------------------------------------------ */

let synthesiser: TTSPipeline | null = null;
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
 * Download and initialise the TTS pipeline.
 * Safe to call multiple times — returns immediately if already loaded.
 */
export async function loadTTS(
  modelId: string,
  onProgress?: TTSProgressCallback,
): Promise<void> {
  if (synthesiser && loadedModelId === modelId) return;
  if (loading) return;

  loading = true;
  onProgress?.({ percent: 0, message: "Loading text-to-speech model..." });

  try {
    const { pipeline: createPipeline } =
      await import("@huggingface/transformers");

    const tts = await createPipeline("text-to-speech", modelId, {
      dtype: "fp32",
      device: "wasm",
      progress_callback: (info: Record<string, unknown>) => {
        if (isDownloadProgress(info)) {
          const pct = Math.round(info.progress);
          onProgress?.({ percent: pct, message: `Downloading: ${pct}%` });
        }
        if (info.status === "ready") {
          onProgress?.({ percent: 100, message: "Ready" });
        }
      },
    });

    // Wrap to avoid storing the wide pipeline union type.
    const wrapped: TTSPipeline = (text, options) =>
      tts(text, options) as Promise<{
        audio: Float32Array;
        sampling_rate: number;
      }>;

    synthesiser = wrapped;
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
  if (!synthesiser) {
    throw new Error("TTS engine not loaded — call loadTTS() first");
  }

  const options: Record<string, string> = {};
  if (speakerId) {
    options.speaker_id = speakerId;
  }

  const result = await synthesiser(text, options);
  return {
    audio: result.audio,
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
  synthesiser = null;
  loadedModelId = null;
}

/**
 * Check if the TTS engine is loaded and ready.
 */
export function isTTSReady(): boolean {
  return synthesiser !== null;
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
