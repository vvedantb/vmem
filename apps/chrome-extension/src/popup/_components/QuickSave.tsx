import { useState } from "react";
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
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Save the current page as a memory in vmem.
      </p>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-medium transition-colors"
      >
        {saving ? "Saving..." : "Save Current Page"}
      </button>

      {result && (
        <p
          className={`text-sm ${result.success ? "text-emerald-400" : "text-red-400"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
