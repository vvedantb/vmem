import { useState } from "react";
import { Button } from "@vmem/ui";
import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { updateMemory } from "@/background/api-client";

export function QuickSave() {
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<{
    memoryId: string;
    title: string;
    content: string;
  } | null>(null);

  function handleSave() {
    setSaving(true);
    setResult(null);
    setPendingUpdate(null);

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
          const pageContent = typeof content === "string" ? content : "";

          const message: ContentMessage = {
            type: "SAVE_PAGE",
            url: tab.url ?? "",
            title: tab.title ?? "Untitled",
            content: pageContent,
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
              } else if (response?.type === "SAVE_DUPLICATE") {
                setPendingUpdate({
                  memoryId: response.existingMemory.id,
                  title: tab.title ?? "Untitled",
                  content: pageContent.slice(0, 10000),
                });
              }
            },
          );
        },
      );
    });
  }

  async function handleUpdate() {
    if (!pendingUpdate) return;
    setSaving(true);
    try {
      await updateMemory(pendingUpdate.memoryId, {
        title: pendingUpdate.title,
        content: pendingUpdate.content,
      });
      setPendingUpdate(null);
      setResult({ success: true, message: "Memory updated" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      setResult({ success: false, message: msg });
    } finally {
      setSaving(false);
    }
  }

  function handleDismiss() {
    setPendingUpdate(null);
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

      {pendingUpdate && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm text-muted-foreground">
            Already saved — update it?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleUpdate}
              disabled={saving}
            >
              Update
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

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
