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
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <IconAlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-foreground">
              WebGPU not available
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Your browser doesn&apos;t support WebGPU, which is required for
              local AI models. Try Chrome, Edge, or another Chromium-based
              browser with WebGPU enabled.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-3">
        <IconInfoCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Local models run entirely in your browser using WebGPU. No data is
          sent to external servers. Models are cached after first download.
        </p>
      </div>

      {/* Model list */}
      <div className="space-y-3">
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
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-xs text-destructive">{loadMessage}</p>
        </div>
      )}
    </div>
  );
}
