/**
 * Settings section for managing local AI models.
 * Supports multiple runtimes: WebLLM (MLC) and MediaPipe.
 * Shows WebGPU support status and a list of available models to download/load.
 */
"use client";

import { useCallback } from "react";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { useLocalLLM } from "@/components/contexts/LocalLLMContext";
import ModelCard from "./ModelCard";

export default function LocalModelsSection() {
  const {
    isSupported,
    models,
    activeModelId,
    engineState,
    loadProgress,
    loadMessage,
    loadedModelId,
    loadingModelId,
    loadModel,
    unloadModel,
  } = useLocalLLM();

  const handleLoad = useCallback(
    (modelId: string) => {
      loadModel(modelId);
    },
    [loadModel],
  );

  const handleUnload = useCallback(() => {
    unloadModel();
  }, [unloadModel]);

  // WebGPU not supported — show info banner
  if (!isSupported) {
    return (
      <div className="flex items-start gap-3">
        <IconAlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-medium text-foreground">
            WebGPU not available
          </h4>
          <p className="text-xs text-muted mt-1">
            Your browser doesn&apos;t support WebGPU, which is required for
            local AI models. Try Chrome, Edge, or another Chromium-based browser
            with WebGPU enabled.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 bg-surface-secondary/40 rounded-lg p-3">
        <IconInfoCircle className="h-4 w-4 text-muted flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted">
          Local models run entirely in your browser using WebGPU. No data is
          sent to external servers. Models are cached after first download.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {models.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            isLoaded={loadedModelId === model.id}
            isActive={activeModelId === model.id}
            engineState={engineState}
            loadProgress={loadProgress}
            loadMessage={loadMessage}
            loadingModelId={loadingModelId}
            onLoad={handleLoad}
            onUnload={handleUnload}
          />
        ))}
      </div>

      {/* Error state */}
      {engineState === "error" && loadMessage && (
        <p className="text-xs text-danger pt-1">{loadMessage}</p>
      )}
    </div>
  );
}
