/**
 * STT engine — browser-local speech-to-text via Transformers.js Whisper.
 *
 * Lazy-loads the Whisper-base ASR pipeline on first use.
 * All inference happens in the main thread (pipeline uses WASM/WebGPU
 * internally). For v2 we can move this into a Web Worker.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Minimal callable shape for the ASR pipeline.
 * We define this locally because the Transformers.js generic
 * `Pipeline` union doesn't narrow cleanly from `createPipeline()`.
 */
interface ASRPipeline {
  (
    audio: Float32Array,
    options?: { language?: string; return_timestamps?: boolean },
  ): Promise<{ text: string } | Array<{ text: string }>>;
}

export type STTProgressCallback = (progress: {
  /** 0–100 percentage, null when indeterminate */
  percent: number | null;
  /** Human-readable status message */
  message: string;
}) => void;

/* ------------------------------------------------------------------ */
/*  Singleton state                                                    */
/* ------------------------------------------------------------------ */

let pipeline: ASRPipeline | null = null;
let loadedModelId: string | null = null;
let loading = false;

/* ------------------------------------------------------------------ */
/*  Progress helper                                                    */
/* ------------------------------------------------------------------ */

/** Type-guard for progress events that carry a numeric percentage. */
function isDownloadProgress(
  info: Record<string, unknown>,
): info is Record<string, unknown> & { progress: number } {
  return info.status === "progress" && typeof info.progress === "number";
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Download and initialise the ASR pipeline.
 * Safe to call multiple times — returns immediately if already loaded.
 */
export async function loadSTT(
  modelId: string,
  onProgress?: STTProgressCallback,
): Promise<void> {
  if (pipeline && loadedModelId === modelId) return;
  if (loading) return;

  loading = true;
  onProgress?.({ percent: 0, message: "Loading speech recognition model..." });

  try {
    // Dynamic import keeps the 15 MB+ transformers bundle out of the
    // main chunk; it only loads when the user actually wants STT.
    const { pipeline: createPipeline, env } =
      await import("@huggingface/transformers");

    // Point the ORT wasm backend at the pinned CDN so rolldown doesn't
    // have to copy the 20+ MB wasm files into the Vercel output. Paired
    // with the `externalize-ort-wasm` plugin in vite.config.ts. The
    // `wasm` config is typed optional, so only set when it exists —
    // if transformers.js didn't initialize it, its own defaults apply.
    const wasmConfig = env.backends.onnx.wasm;
    if (wasmConfig) {
      wasmConfig.wasmPaths =
        "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.1.0/dist/";
    }

    const transcriber = await createPipeline(
      "automatic-speech-recognition",
      modelId,
      {
        dtype: "q8",
        device: "webgpu",
        progress_callback: (info: Record<string, unknown>) => {
          if (isDownloadProgress(info)) {
            const pct = Math.round(info.progress);
            onProgress?.({ percent: pct, message: `Downloading: ${pct}%` });
          }
          if (info.status === "ready") {
            onProgress?.({ percent: 100, message: "Ready" });
          }
        },
      },
    );

    // Wrap the pipeline in a typed function to avoid storing the wide union.
    const wrapped: ASRPipeline = (audio, options) =>
      transcriber(audio, options) as Promise<
        { text: string } | Array<{ text: string }>
      >;

    pipeline = wrapped;
    loadedModelId = modelId;
  } finally {
    loading = false;
  }
}

/**
 * Transcribe raw PCM audio to text.
 *
 * Accepts a `Float32Array` of mono 16 kHz PCM samples.
 * Use `blobToFloat32()` from voice-session.ts to convert a
 * recorded Blob before calling this.
 */
export async function transcribe(audio: Float32Array): Promise<string> {
  if (!pipeline) {
    throw new Error("STT engine not loaded — call loadSTT() first");
  }

  const result = await pipeline(audio, {
    language: "en",
    return_timestamps: false,
  });

  if (Array.isArray(result)) {
    return result.map((r) => r.text).join(" ");
  }

  return result.text;
}

/**
 * Free the loaded model from memory.
 */
export function unloadSTT(): void {
  pipeline = null;
  loadedModelId = null;
}

/**
 * Check if the STT engine is loaded and ready for transcription.
 */
export function isSTTReady(): boolean {
  return pipeline !== null;
}

/**
 * Get the currently loaded STT model id, or null.
 */
export function getLoadedSTTModelId(): string | null {
  return loadedModelId;
}

/**
 * Check if the STT engine is currently loading.
 */
export function isSTTLoading(): boolean {
  return loading;
}
