/**
 * React context for WebLLM model management.
 * Provides model loading/unloading state, progress tracking, and WebGPU support detection.
 */
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { InitProgressReport } from "@mlc-ai/web-llm";
import type { WebLLMLanguageModel } from "@built-in-ai/web-llm";
import { WEB_LLM_MODELS, type WebLLMModelInfo } from "@/lib/webllm-models";
import {
  loadEngine,
  unloadEngine,
  getEngine,
  getLoadedModelId,
  getActiveModelId,
  setActiveModelId as persistActiveModelId,
  isWebGPUSupported,
} from "@/lib/webllm-engine";

export type EngineState = "idle" | "loading" | "ready" | "error";

interface WebLLMContextValue {
  /** Whether the browser supports WebGPU */
  isSupported: boolean;
  /** Available models */
  models: WebLLMModelInfo[];
  /** User's preferred model ID (from localStorage) */
  activeModelId: string | null;
  /** Current engine lifecycle state */
  engineState: EngineState;
  /** Load progress 0–100 during download/init, null otherwise */
  loadProgress: number | null;
  /** Human-readable progress message during loading */
  loadMessage: string | null;
  /** The loaded AI SDK LanguageModel, or null */
  model: WebLLMLanguageModel | null;
  /** ID of the model currently loaded in VRAM */
  loadedModelId: string | null;
  /** ID of the model currently being loaded, null if not loading */
  loadingModelId: string | null;
  /** Load a model by ID (downloads if needed) */
  loadModel: (modelId: string) => Promise<void>;
  /** Unload the current model, freeing VRAM */
  unloadModel: () => Promise<void>;
  /** Set the active model preference (doesn't load it) */
  setActiveModelId: (modelId: string) => void;
}

const WebLLMContext = createContext<WebLLMContextValue | null>(null);

export function WebLLMProvider({ children }: { children: ReactNode }) {
  const [isSupported, setIsSupported] = useState(false);
  const [activeModelId, setActiveModelIdState] = useState<string | null>(null);
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [model, setModel] = useState<WebLLMLanguageModel | null>(null);
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);

  // Check WebGPU support and read persisted active model on mount
  useEffect(() => {
    setIsSupported(isWebGPUSupported());
    const stored = getActiveModelId();
    if (stored) {
      setActiveModelIdState(stored);
    }
  }, []);

  const handleSetActiveModelId = useCallback((modelId: string) => {
    persistActiveModelId(modelId);
    setActiveModelIdState(modelId);
  }, []);

  const handleLoadModel = useCallback(async (modelId: string) => {
    setEngineState("loading");
    setLoadingModelId(modelId);
    setLoadProgress(0);
    setLoadMessage("Initializing...");

    try {
      const onProgress = (progress: InitProgressReport) => {
        // Extract percentage from progress text if available
        const match = progress.text.match(/(\d+)%/);
        if (match) {
          setLoadProgress(parseInt(match[1], 10));
        }
        setLoadMessage(progress.text);
      };

      const loadedModel = await loadEngine(modelId, onProgress);

      setModel(loadedModel);
      setLoadedModelId(modelId);
      setLoadingModelId(null);
      setEngineState("ready");
      setLoadProgress(100);
      setLoadMessage(null);

      // Also persist as active model
      persistActiveModelId(modelId);
      setActiveModelIdState(modelId);
    } catch (err) {
      setEngineState("error");
      setLoadingModelId(null);
      setLoadProgress(null);
      setLoadMessage(
        err instanceof Error ? err.message : "Failed to load model",
      );
      setModel(null);
      setLoadedModelId(null);
    }
  }, []);

  const handleUnloadModel = useCallback(async () => {
    await unloadEngine();
    setModel(null);
    setLoadedModelId(null);
    setLoadingModelId(null);
    setEngineState("idle");
    setLoadProgress(null);
    setLoadMessage(null);
  }, []);

  // Sync with engine state on mount (in case engine was loaded before context mounted)
  useEffect(() => {
    const existing = getEngine();
    if (existing) {
      setModel(existing);
      setLoadedModelId(getLoadedModelId());
      setEngineState("ready");
    }
  }, []);

  return (
    <WebLLMContext.Provider
      value={{
        isSupported,
        models: WEB_LLM_MODELS,
        activeModelId,
        engineState,
        loadProgress,
        loadMessage,
        model,
        loadedModelId,
        loadingModelId,
        loadModel: handleLoadModel,
        unloadModel: handleUnloadModel,
        setActiveModelId: handleSetActiveModelId,
      }}
    >
      {children}
    </WebLLMContext.Provider>
  );
}

export function useWebLLM(): WebLLMContextValue {
  const ctx = useContext(WebLLMContext);
  if (ctx === null) {
    throw new Error("useWebLLM must be used within a WebLLMProvider");
  }
  return ctx;
}
