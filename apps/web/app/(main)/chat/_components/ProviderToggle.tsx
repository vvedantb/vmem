/**
 * Toggle between cloud and local LLM providers in the chat prompt footer.
 * Shows a cloud/device icon with tooltip indicating current mode.
 * Only renders when WebGPU is supported.
 */
"use client";

import { useCallback } from "react";
import { IconCloud, IconDeviceDesktop } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@vmem/ui";
import { useWebLLM } from "@/components/contexts/WebLLMContext";
import { useChatProvider } from "@/hooks/useChatProvider";
import { findModel } from "@/lib/webllm-models";

export default function ProviderToggle() {
  const {
    isSupported,
    activeModelId,
    engineState,
    loadedModelId,
    loadingModelId,
  } = useWebLLM();
  const { provider, setProvider } = useChatProvider();

  const loadedModelInfo =
    loadedModelId === null ? undefined : findModel(loadedModelId);
  const pendingModelId = loadingModelId ?? activeModelId;
  const pendingModelInfo =
    pendingModelId === null ? undefined : findModel(pendingModelId);

  const handleToggle = useCallback(() => {
    if (provider === "cloud") {
      if (engineState === "loading") {
        toast.info("Local model is loading", {
          description:
            pendingModelInfo === undefined
              ? "Wait for the local model to finish initializing."
              : `${pendingModelInfo.name} is still initializing.`,
        });
        return;
      }

      if (engineState !== "ready") {
        toast.info("No local model loaded", {
          description: "Go to Settings > Preferences to load a local model.",
        });
        return;
      }

      setProvider("local");
      return;
    }

    setProvider("cloud");
  }, [provider, engineState, pendingModelInfo, setProvider]);

  if (!isSupported) {
    return null;
  }

  const isLocal = provider === "local";
  const tooltipText = isLocal
    ? engineState === "loading"
      ? `Local loading: ${pendingModelInfo?.name ?? "Model"}`
      : `Local: ${loadedModelInfo?.name ?? "Unknown model"}`
    : "Cloud: OpenRouter";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={isLocal ? "secondary" : "ghost"}
          size="icon-xs"
          onClick={handleToggle}
          aria-label={`Switch to ${isLocal ? "cloud" : "local"} model`}
        >
          {isLocal ? (
            <IconDeviceDesktop className="h-4 w-4" />
          ) : (
            <IconCloud className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
