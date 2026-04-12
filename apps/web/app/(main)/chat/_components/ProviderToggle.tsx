/**
 * Toggle between cloud and local LLM providers in the chat prompt footer.
 * Shows a cloud/device icon with tooltip indicating current mode.
 * Only renders when WebGPU is supported.
 */
"use client";

import { useCallback } from "react";
import { IconCloud, IconDeviceDesktop } from "@tabler/icons-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger, Button } from "@vmem/ui";
import { useWebLLM } from "@/components/contexts/WebLLMContext";
import { useChatProvider } from "@/hooks/useChatProvider";
import { findModel } from "@/lib/webllm-models";

export default function ProviderToggle() {
  const { isSupported, engineState, loadedModelId } = useWebLLM();
  const { provider, setProvider } = useChatProvider();

  const handleToggle = useCallback(() => {
    if (provider === "cloud") {
      // Switching to local — check if a model is loaded
      if (engineState !== "ready") {
        toast.info("No local model loaded", {
          description: "Go to Settings → Preferences to download a model.",
        });
        return;
      }
      setProvider("local");
    } else {
      setProvider("cloud");
    }
  }, [provider, engineState, setProvider]);

  // Don't render if WebGPU isn't supported
  if (!isSupported) return null;

  const isLocal = provider === "local";
  const modelInfo = loadedModelId ? findModel(loadedModelId) : null;
  const tooltipText = isLocal
    ? `Local: ${modelInfo?.name ?? "Unknown model"}`
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
