/**
 * Individual model card for the Local AI Models section.
 * Shows model info, status, and load/unload actions with progress.
 */
"use client";

import {
  IconCheck,
  IconDownload,
  IconLoader2,
  IconPlayerStop,
  IconCpu,
} from "@tabler/icons-react";
import { Button, Progress, Badge } from "@vmem/ui";
import type { WebLLMModelInfo } from "@/lib/webllm-models";
import type { EngineState } from "@/components/contexts/WebLLMContext";

interface ModelCardProps {
  model: WebLLMModelInfo;
  isLoaded: boolean;
  isActive: boolean;
  engineState: EngineState;
  loadProgress: number | null;
  loadMessage: string | null;
  loadingModelId: string | null;
  onLoad: (modelId: string) => void;
  onUnload: () => void;
}

export default function ModelCard({
  model,
  isLoaded,
  isActive,
  engineState,
  loadProgress,
  loadMessage,
  loadingModelId,
  onLoad,
  onUnload,
}: ModelCardProps) {
  const isThisModelLoading = loadingModelId === model.id;
  const isAnyLoading = engineState === "loading";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground">
              {model.name}
            </h4>
            {isLoaded && (
              <Badge variant="secondary" className="text-xs">
                <IconCpu className="h-3 w-3 mr-1" />
                Loaded
              </Badge>
            )}
            {isActive && !isLoaded && (
              <Badge variant="outline" className="text-xs">
                Default
              </Badge>
            )}
          </div>
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            <span>{model.size}</span>
            <span>·</span>
            <span>~{model.vramMB}MB VRAM</span>
          </div>
        </div>

        <div className="flex-shrink-0">
          {isLoaded ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onUnload}
              disabled={isAnyLoading}
            >
              <IconPlayerStop className="h-3.5 w-3.5 mr-1.5" />
              Unload
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onLoad(model.id)}
              disabled={isAnyLoading}
            >
              {isThisModelLoading ? (
                <IconLoader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <IconDownload className="h-3.5 w-3.5 mr-1.5" />
              )}
              {isThisModelLoading ? "Loading..." : "Load"}
            </Button>
          )}
        </div>
      </div>

      {/* Loading progress bar */}
      {isThisModelLoading && loadProgress !== null && (
        <div className="space-y-1.5">
          <Progress value={loadProgress} className="h-1.5" />
          {loadMessage && (
            <p className="text-xs text-muted-foreground truncate">
              {loadMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
