import { useState, useEffect, useCallback } from "react";
import { useUser, useClerk } from "@clerk/chrome-extension";
import { IconSparkles, IconDownload, IconCheck } from "@tabler/icons-react";
import { Button, Label, Switch, Spinner } from "@vmem/ui";
import { getStorage, setStorage } from "@/lib/storage";
import { useExtensionUserSettings } from "@/popup/useExtensionUserSettings";
import type { BackgroundResponse, ProgressMessage } from "@/types/messages";

type EnrichmentMethod = "chrome-ai" | "webllm" | null;

interface EnrichmentStatus {
  method: EnrichmentMethod;
  modelLoaded: boolean;
  modelProgress?: number;
}

export function SettingsForm() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { settings, update } = useExtensionUserSettings();
  const [localEnrichmentEnabled, setLocalEnrichmentEnabled] = useState(true);
  const [enrichmentStatus, setEnrichmentStatus] =
    useState<EnrichmentStatus | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadProgress, setLoadProgress] = useState<{
    progress: number;
    text: string;
  } | null>(null);

  useEffect(() => {
    getStorage().then((s) => {
      setLocalEnrichmentEnabled(s.localEnrichmentEnabled);
    });

    // Get enrichment status
    chrome.runtime
      .sendMessage({ type: "GET_ENRICHMENT_STATUS" })
      .then((response: BackgroundResponse) => {
        if (response.type === "ENRICHMENT_STATUS") {
          setEnrichmentStatus({
            method: response.method,
            modelLoaded: response.modelLoaded,
            modelProgress: response.modelProgress,
          });
        }
      })
      .catch(() => {
        // Background might not be ready yet
      });
  }, []);

  // Listen for model load progress
  useEffect(() => {
    function handleProgress(message: ProgressMessage) {
      if (message.type === "MODEL_LOAD_PROGRESS") {
        setLoadProgress({
          progress: message.progress,
          text: message.text,
        });
      }
    }

    chrome.runtime.onMessage.addListener(handleProgress);
    return () => chrome.runtime.onMessage.removeListener(handleProgress);
  }, []);

  function handleSelectionPopupToggle(checked: boolean) {
    void update({ extensionSelectionPopupEnabled: checked });
  }

  function handleLocalEnrichmentToggle(checked: boolean) {
    setLocalEnrichmentEnabled(checked);
    setStorage({ localEnrichmentEnabled: checked });
  }

  const handleLoadModel = useCallback(async () => {
    console.log("[popup] Download button clicked");
    setIsLoadingModel(true);
    setLoadProgress({ progress: 0, text: "Initializing..." });

    try {
      console.log("[popup] Sending LOAD_ENRICHMENT_MODEL to background...");
      const response: BackgroundResponse = await chrome.runtime.sendMessage({
        type: "LOAD_ENRICHMENT_MODEL",
      });
      console.log("[popup] Got response:", response);

      if (response.type === "MODEL_LOAD_RESULT" && response.success) {
        setEnrichmentStatus((prev) =>
          prev ? { ...prev, modelLoaded: true } : null,
        );
      }
    } catch (err) {
      console.error("[popup] Failed to load model:", err);
    } finally {
      console.log("[popup] handleLoadModel finished");
      setIsLoadingModel(false);
      setLoadProgress(null);
    }
  }, []);

  const getStatusBadge = () => {
    if (!enrichmentStatus) return null;

    if (enrichmentStatus.method === "chrome-ai") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <IconCheck size={12} />
          Chrome AI
        </span>
      );
    }

    if (enrichmentStatus.method === "webllm") {
      if (enrichmentStatus.modelLoaded) {
        return (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <IconCheck size={12} />
            Qwen 0.6B
          </span>
        );
      }

      if (isLoadingModel && loadProgress) {
        return (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            <span className="tabular-nums">{loadProgress.progress}%</span>
          </span>
        );
      }

      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1 relative before:absolute before:inset-[-7px] before:content-['']"
          onClick={handleLoadModel}
          disabled={isLoadingModel}
        >
          <IconDownload size={12} />
          Download
        </Button>
      );
    }

    return <span className="text-xs text-muted-foreground">Not available</span>;
  };

  return (
    <div className="space-y-5">
      {user && (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {user.fullName ?? user.primaryEmailAddress?.emailAddress}
            </p>
            {user.fullName && (
              <p className="text-xs text-muted-foreground truncate">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="selection-popup-toggle" className="text-sm">
          Save popup on text selection
        </Label>
        <Switch
          id="selection-popup-toggle"
          checked={settings?.extensionSelectionPopupEnabled ?? true}
          onCheckedChange={handleSelectionPopupToggle}
          disabled={settings === undefined}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconSparkles size={16} className="text-muted-foreground" />
            <Label htmlFor="local-enrichment-toggle" className="text-sm">
              Local AI tagging
            </Label>
          </div>
          <Switch
            id="local-enrichment-toggle"
            checked={localEnrichmentEnabled}
            onCheckedChange={handleLocalEnrichmentToggle}
          />
        </div>
        {localEnrichmentEnabled && (
          <div className="flex items-center justify-between pl-6">
            <span className="text-xs text-muted-foreground">Status</span>
            {getStatusBadge()}
          </div>
        )}
        {isLoadingModel && loadProgress && (
          <div className="pl-6">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${loadProgress.progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {loadProgress.text}
            </p>
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        className="w-full text-destructive hover:text-destructive"
        onClick={() => signOut()}
      >
        Sign Out
      </Button>
    </div>
  );
}
