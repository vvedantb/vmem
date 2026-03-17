import { useState } from "react";
import { Button } from "@vmem/ui";
import type { ContentMessage, BackgroundResponse } from "@/types/messages";

export function QuickSave() {
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  function handleSave() {
    setSaving(true);
    setResult(null);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id || !tab.url) {
        setSaving(false);
        setResult({ success: false, message: "No active tab found" });
        return;
      }

      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => document.body.innerText,
        },
        (results) => {
          const content = results?.[0]?.result ?? "";

          const message: ContentMessage = {
            type: "SAVE_PAGE",
            url: tab.url ?? "",
            title: tab.title ?? "Untitled",
            content: typeof content === "string" ? content : "",
          };

          chrome.runtime.sendMessage(
            message,
            (response: BackgroundResponse | undefined) => {
              setSaving(false);
              if (response?.type === "SAVE_RESULT") {
                setResult(
                  response.success
                    ? { success: true, message: "Page saved to vmem" }
                    : {
                        success: false,
                        message: response.error ?? "Failed to save",
                      },
                );
              }
            },
          );
        },
      );
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Save the current page as a memory in vmem.
      </p>

      <Button
        variant="outline"
        className="w-full"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save Current Page"}
      </Button>

      {result && (
        <p
          className={`text-sm ${result.success ? "text-success" : "text-destructive"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
