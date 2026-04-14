/**
 * MediaPipe LLM engine manager for Gemma models.
 * Uses Google's MediaPipe tasks-genai for optimized Gemma inference.
 */

import { FilesetResolver, LlmInference } from "@mediapipe/tasks-genai";

export interface MediaPipeProgressReport {
  text: string;
  progress: number;
}

// Model URLs on HuggingFace (GPU-optimized .task files from litert-community)
const MODEL_URLS: Record<string, string> = {
  "gemma-4-e2b-it":
    "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task",
  "gemma-4-e4b-it":
    "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task",
};

// Singleton state
let currentInference: LlmInference | null = null;
let currentModelId: string | null = null;
let genaiFileset: Awaited<
  ReturnType<typeof FilesetResolver.forGenAiTasks>
> | null = null;

/**
 * Initialize the MediaPipe GenAI fileset (WASM modules).
 * Cached after first initialization.
 */
async function getGenAIFileset() {
  if (genaiFileset) return genaiFileset;
  genaiFileset = await FilesetResolver.forGenAiTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@latest/wasm",
  );
  return genaiFileset;
}

/**
 * Download model with progress tracking.
 * MediaPipe doesn't expose download progress, so we fetch manually.
 */
async function downloadModelWithProgress(
  url: string,
  onProgress?: (report: MediaPipeProgressReport) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download model: ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body || total === 0) {
    // Fallback: no streaming progress available
    onProgress?.({ text: "Downloading model...", progress: 0 });
    const buffer = await response.arrayBuffer();
    onProgress?.({ text: "Download complete", progress: 100 });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    loaded += value.length;

    const progress = Math.round((loaded / total) * 100);
    onProgress?.({
      text: `Downloading: ${progress}%`,
      progress,
    });
  }

  // Combine chunks into single ArrayBuffer
  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined.buffer;
}

/**
 * Load a Gemma model via MediaPipe.
 * Downloads the model if needed and initializes LlmInference.
 */
export async function loadMediaPipeModel(
  modelId: string,
  onProgress?: (report: MediaPipeProgressReport) => void,
): Promise<LlmInference> {
  // If same model is already loaded, return it
  if (currentInference && currentModelId === modelId) {
    return currentInference;
  }

  // Unload any existing model first
  await unloadMediaPipeModel();

  const modelUrl = MODEL_URLS[modelId];
  if (!modelUrl) {
    throw new Error(`Unknown MediaPipe model: ${modelId}`);
  }

  onProgress?.({ text: "Initializing MediaPipe...", progress: 0 });

  // Initialize WASM fileset
  const fileset = await getGenAIFileset();

  onProgress?.({ text: "Downloading model...", progress: 5 });

  // Download model with progress
  const modelBuffer = await downloadModelWithProgress(modelUrl, (report) => {
    // Scale download progress to 5-90%
    const scaledProgress = 5 + Math.round(report.progress * 0.85);
    onProgress?.({ text: report.text, progress: scaledProgress });
  });

  onProgress?.({ text: "Loading model into GPU...", progress: 92 });

  // Create LlmInference from buffer
  const inference = await LlmInference.createFromOptions(fileset, {
    baseOptions: {
      modelAssetBuffer: new Uint8Array(modelBuffer),
    },
    maxTokens: 2048,
    topK: 40,
    temperature: 0.7,
    randomSeed: Math.floor(Math.random() * 1000),
  });

  currentInference = inference;
  currentModelId = modelId;

  onProgress?.({ text: "Model ready", progress: 100 });

  return inference;
}

/**
 * Get the currently loaded MediaPipe model.
 */
export function getMediaPipeModel(): LlmInference | null {
  return currentInference;
}

/**
 * Get the ID of the currently loaded MediaPipe model.
 */
export function getLoadedMediaPipeModelId(): string | null {
  return currentModelId;
}

/**
 * Unload the current MediaPipe model, freeing GPU memory.
 */
export async function unloadMediaPipeModel(): Promise<void> {
  if (currentInference) {
    try {
      currentInference.close();
    } catch {
      // Model may already be closed
    }
  }
  currentInference = null;
  currentModelId = null;
}

/**
 * Generate text with streaming using MediaPipe.
 * Returns the full response text.
 */
export async function generateWithMediaPipe(
  prompt: string,
  onToken?: (token: string) => void,
): Promise<string> {
  if (!currentInference) {
    throw new Error("MediaPipe model not loaded");
  }

  // MediaPipe uses callback-based streaming
  let fullResponse = "";

  await currentInference.generateResponse(prompt, (partialResult: string) => {
    fullResponse = partialResult;
    onToken?.(partialResult);
  });

  return fullResponse;
}

/**
 * Format a conversation for Gemma models.
 * Uses Gemma's chat template format.
 */
export function formatGemmaPrompt(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  let prompt = "";

  // Add system instruction if provided
  if (systemPrompt) {
    prompt += `<start_of_turn>user\n${systemPrompt}\n<end_of_turn>\n<start_of_turn>model\nUnderstood.\n<end_of_turn>\n`;
  }

  // Add conversation history
  for (const msg of messages) {
    const role = msg.role === "user" ? "user" : "model";
    prompt += `<start_of_turn>${role}\n${msg.content}\n<end_of_turn>\n`;
  }

  // Add model turn prefix for generation
  prompt += "<start_of_turn>model\n";

  return prompt;
}
