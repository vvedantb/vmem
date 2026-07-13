/**
 * React context for local LLM model management.
 * Supports multiple runtimes: WebLLM (MLC) and MediaPipe.
 * Provides model loading/unloading state, progress tracking, and WebGPU support detection.
 *
 * IMPORTANT: Heavy dependencies (@mlc-ai/web-llm, transformers.js) are lazy-loaded
 * only when loadModel() is called, not at initial page load.
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
import { useLocalStorage } from "usehooks-ts";
import type { InitProgressReport } from "@mlc-ai/web-llm";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import {
  LOCAL_MODELS,
  type LocalModelInfo,
  type LocalModelRuntime,
} from "@/lib/local-models";

export type EngineState = "idle" | "loading" | "ready" | "error";
export type LocalLanguageModel = LanguageModelV3;

const ACTIVE_MODEL_KEY = "vmem:activeLocalModelId";

function isWebGPUSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "gpu" in navigator;
}

interface LocalLLMContextValue {
  /** Whether the browser supports WebGPU */
  isSupported: boolean;
  /** Available models */
  models: LocalModelInfo[];
  /** User's preferred model ID (from localStorage) */
  activeModelId: string | null;
  /** Current engine lifecycle state */
  engineState: EngineState;
  /** Load progress 0–100 during download/init, null otherwise */
  loadProgress: number | null;
  /** Human-readable progress message during loading */
  loadMessage: string | null;
  /** The loaded AI SDK LanguageModel, or null */
  model: LocalLanguageModel | null;
  /** ID of the model currently loaded in GPU memory */
  loadedModelId: string | null;
  /** ID of the model currently being loaded, null if not loading */
  loadingModelId: string | null;
  /** Current runtime being used ("webllm" | "mediapipe" | null) */
  currentRuntime: LocalModelRuntime | null;
  /** Load a model by ID (downloads if needed) */
  loadModel: (modelId: string) => Promise<void>;
  /** Unload the current model, freeing GPU memory */
  unloadModel: () => Promise<void>;
  /** Set the active model preference (doesn't load it) */
  setActiveModelId: (modelId: string) => void;
}

const LocalLLMContext = createContext<LocalLLMContextValue | null>(null);

// Lazy-loaded engine module (only imported when loadModel is called)
let engineModule: typeof import("@/lib/local-engine") | null = null;

async function getEngineModule() {
  if (!engineModule) {
    engineModule = await import("@/lib/local-engine");
  }
  return engineModule;
}

export function LocalLLMProvider({ children }: { children: ReactNode }) {
  const [isSupported, setIsSupported] = useState(false);
  const [activeModelId, setActiveModelId, removeActiveModelId] =
    useLocalStorage<string | null>(ACTIVE_MODEL_KEY, null);
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [model, setModel] = useState<LocalLanguageModel | null>(null);
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);
  const [currentRuntimeState, setCurrentRuntimeState] =
    useState<LocalModelRuntime | null>(null);

  // Check WebGPU support on mount and validate stored model
  useEffect(() => {
    setIsSupported(isWebGPUSupported());
    // useLocalStorage handles reading from localStorage
    // Just validate the stored model still exists in available models
    if (
      activeModelId !== null &&
      !LOCAL_MODELS.some((modelInfo) => modelInfo.id === activeModelId)
    ) {
      removeActiveModelId();
    }
  }, []); // Only validate on mount

  const handleSetActiveModelId = useCallback(
    (modelId: string) => {
      setActiveModelId(modelId);
    },
    [setActiveModelId],
  );

  const handleLoadModel = useCallback(
    async (modelId: string) => {
      setEngineState("loading");
      setLoadingModelId(modelId);
      setLoadProgress(0);
      setLoadMessage("Initializing...");

      try {
        // Lazy load the heavy engine module only when actually loading a model
        const engine = await getEngineModule();

        const onProgress = (progress: InitProgressReport) => {
          // Extract percentage from progress text if available
          const match = progress.text.match(/(\d+)%/);
          if (match) {
            setLoadProgress(parseInt(match[1], 10));
          }
          setLoadMessage(progress.text);
        };

        const loadedModel = await engine.loadEngine(modelId, onProgress);

        setModel(loadedModel);
        setLoadedModelId(modelId);
        setLoadingModelId(null);
        setCurrentRuntimeState(engine.getCurrentRuntime());
        setEngineState("ready");
        setLoadProgress(100);
        setLoadMessage(null);

        // Also persist as active model
        setActiveModelId(modelId);
      } catch (err) {
        setEngineState("error");
        setLoadingModelId(null);
        setLoadProgress(null);
        setLoadMessage(
          err instanceof Error ? err.message : "Failed to load model",
        );
        setModel(null);
        setLoadedModelId(null);
        setCurrentRuntimeState(null);
      }
    },
    [setActiveModelId],
  );

  const handleUnloadModel = useCallback(async () => {
    if (engineModule) {
      await engineModule.unloadEngine();
    }
    removeActiveModelId();
    setModel(null);
    setLoadedModelId(null);
    setLoadingModelId(null);
    setCurrentRuntimeState(null);
    setEngineState("idle");
    setLoadProgress(null);
    setLoadMessage(null);
  }, [removeActiveModelId]);

  // Sync with engine state on mount (in case engine was loaded before context mounted)
  useEffect(() => {
    if (engineModule) {
      const existing = engineModule.getEngine();
      if (existing) {
        setModel(existing);
        setLoadedModelId(engineModule.getLoadedModelId());
        setCurrentRuntimeState(engineModule.getCurrentRuntime());
        setEngineState("ready");
      }
    }
  }, []);

  // Auto-load saved model preference on mount (if WebGPU supported)
  useEffect(() => {
    if (!isSupported || activeModelId === null) {
      return;
    }

    if (model !== null || engineState !== "idle" || loadingModelId !== null) {
      return;
    }

    void handleLoadModel(activeModelId);
  }, [
    activeModelId,
    engineState,
    handleLoadModel,
    isSupported,
    loadingModelId,
    model,
  ]);

  return (
    <LocalLLMContext.Provider
      value={{
        isSupported,
        models: LOCAL_MODELS,
        activeModelId,
        engineState,
        loadProgress,
        loadMessage,
        model,
        loadedModelId,
        loadingModelId,
        currentRuntime: currentRuntimeState,
        loadModel: handleLoadModel,
        unloadModel: handleUnloadModel,
        setActiveModelId: handleSetActiveModelId,
      }}
    >
      {children}
    </LocalLLMContext.Provider>
  );
}

export function useLocalLLM(): LocalLLMContextValue {
  const ctx = useContext(LocalLLMContext);
  if (ctx === null) {
    throw new Error("useLocalLLM must be used within a LocalLLMProvider");
  }
  return ctx;
}

// Backwards compatibility exports
export const WebLLMProvider = LocalLLMProvider;
export const useWebLLM = useLocalLLM;
