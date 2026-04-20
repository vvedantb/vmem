import { useState, useEffect } from "react";
import { Button } from "@vmem/ui";
import type { ContentMessage, BackgroundResponse } from "@/types/messages";
import { updateMemory } from "@/background/api-client";

interface PageInfo {
  title: string;
  url: string;
  favicon: string;
}

function formatTimestamp(): string {
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  return `Today at ${timeStr}`;
}

function truncateUrl(url: string, maxLength = 40): string {
  try {
    const parsed = new URL(url);
    const display = parsed.host + parsed.pathname;
    if (display.length <= maxLength) return display;
    return display.slice(0, maxLength - 1) + "…";
  } catch {
    return url.slice(0, maxLength);
  }
}

export function QuickSave() {
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
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

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url) {
        setPageInfo({
          title: tab.title ?? "Untitled",
          url: tab.url,
          favicon: tab.favIconUrl ?? "",
        });
      }
    });
  }, []);

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
    <div className="space-y-4">
      {/* Page preview card */}
      {pageInfo && (
        <div className="glass-panel-subtle rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2.5">
            {pageInfo.favicon ? (
              <img
                src={pageInfo.favicon}
                alt=""
                className="w-4 h-4 mt-0.5 rounded-sm shrink-0 outline outline-1 outline-white/10"
              />
            ) : (
              <div className="w-4 h-4 mt-0.5 rounded-sm bg-muted shrink-0" />
            )}
            <span className="text-sm font-medium leading-tight line-clamp-2 text-balance">
              {pageInfo.title}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {truncateUrl(pageInfo.url)}
          </p>
          <p className="text-xs text-muted-foreground">{formatTimestamp()}</p>
        </div>
      )}

      <Button
        variant="outline"
        className="w-full"
        onClick={handleSave}
        disabled={saving || !pageInfo}
      >
        {saving ? "Saving..." : "Save to vmem"}
      </Button>

      {pendingUpdate && (
        <div className="space-y-2 glass-panel-subtle rounded-xl p-3">
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
