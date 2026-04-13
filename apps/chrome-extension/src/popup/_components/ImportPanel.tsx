import { useState, useEffect } from "react";
import {
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Progress,
  Switch,
} from "@vmem/ui";
import type {
  ContentMessage,
  BackgroundResponse,
  ProgressMessage,
} from "@/types/messages";
import { getStorage, setStorage } from "@/lib/storage";

type ImportStatus = "idle" | "importing" | "done" | "error" | "cancelled";

function formatLastSync(epochMs: number): string {
  if (epochMs === 0) return "Never synced";
  const diffMs = Date.now() - epochMs;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

export function ImportPanel() {
  const [historyDays, setHistoryDays] = useState("7");
  const [bookmarkStatus, setBookmarkStatus] = useState<ImportStatus>("idle");
  const [historyStatus, setHistoryStatus] = useState<ImportStatus>("idle");
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [lastBookmarkSync, setLastBookmarkSync] = useState(0);
  const [lastHistorySync, setLastHistorySync] = useState(0);

  // Load storage values on mount
  useEffect(() => {
    void getStorage().then((storage) => {
      setAutoSyncEnabled(storage.autoSyncEnabled);
      setLastBookmarkSync(storage.lastBookmarkSync);
      setLastHistorySync(storage.lastHistorySync);
    });
  }, []);

  useEffect(() => {
    function handleProgress(message: ProgressMessage) {
      if (message.type === "IMPORT_PROGRESS") {
        setProgress({ current: message.current, total: message.total });
      }
    }

    chrome.runtime.onMessage.addListener(handleProgress);
    return () => chrome.runtime.onMessage.removeListener(handleProgress);
  }, []);

  function handleAutoSyncToggle(checked: boolean) {
    setAutoSyncEnabled(checked);
    void setStorage({ autoSyncEnabled: checked });
  }

  function handleImportBookmarks() {
    setBookmarkStatus("importing");
    setProgress(null);
    setResultMessage(null);

    const message: ContentMessage = { type: "IMPORT_BOOKMARKS" };
    chrome.runtime.sendMessage(
      message,
      (response: BackgroundResponse | undefined) => {
        if (response?.type === "IMPORT_RESULT") {
          if (response.locked) {
            setBookmarkStatus("idle");
            setResultMessage("Sync already in progress");
          } else {
            setBookmarkStatus(response.success ? "done" : "error");
            setResultMessage(
              response.success
                ? `Synced ${response.count} new bookmarks`
                : (response.error ?? "Sync failed"),
            );
            setLastBookmarkSync(Date.now());
          }
        }
        setProgress(null);
      },
    );
  }

  function handleImportHistory() {
    setHistoryStatus("importing");
    setProgress(null);
    setResultMessage(null);

    const message: ContentMessage = {
      type: "IMPORT_HISTORY",
      days: Number(historyDays),
    };
    chrome.runtime.sendMessage(
      message,
      (response: BackgroundResponse | undefined) => {
        if (response?.type === "IMPORT_RESULT") {
          if (response.locked) {
            setHistoryStatus("idle");
            setResultMessage("Sync already in progress");
          } else {
            setHistoryStatus(response.success ? "done" : "error");
            setResultMessage(
              response.success
                ? `Synced ${response.count} new history entries`
                : (response.error ?? "Sync failed"),
            );
            setLastHistorySync(Date.now());
          }
        }
        setProgress(null);
      },
    );
  }

  function handleCancel() {
    const message: ContentMessage = { type: "CANCEL_IMPORT" };
    chrome.runtime.sendMessage(message);

    if (bookmarkStatus === "importing") setBookmarkStatus("cancelled");
    if (historyStatus === "importing") setHistoryStatus("cancelled");
    setResultMessage(
      `Cancelled — ${progress?.current ?? 0} items synced before stopping`,
    );
    setProgress(null);
  }

  const isImporting =
    bookmarkStatus === "importing" || historyStatus === "importing";

  function handleResetSync() {
    void setStorage({ lastBookmarkSync: 0, lastHistorySync: 0 });
    setLastBookmarkSync(0);
    setLastHistorySync(0);
    setResultMessage(
      "Sync timestamps reset — next sync will include all items",
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Auto-sync</span>
        <Switch
          checked={autoSyncEnabled}
          onCheckedChange={handleAutoSyncToggle}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            Bookmarks
          </h3>
          <span className="text-xs text-muted-foreground">
            {formatLastSync(lastBookmarkSync)}
          </span>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleImportBookmarks}
          disabled={isImporting}
        >
          {bookmarkStatus === "importing" ? "Syncing..." : "Sync Bookmarks"}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            Browsing History
          </h3>
          <span className="text-xs text-muted-foreground">
            {formatLastSync(lastHistorySync)}
          </span>
        </div>
        <div className="flex gap-2">
          <Select
            value={historyDays}
            onValueChange={setHistoryDays}
            disabled={isImporting}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleImportHistory}
            disabled={isImporting}
          >
            {historyStatus === "importing" ? "Syncing..." : "Sync History"}
          </Button>
        </div>
      </div>

      {progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>
              {progress.current} / {progress.total}
            </span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} />
        </div>
      )}

      {isImporting && (
        <Button variant="destructive" className="w-full" onClick={handleCancel}>
          Cancel Sync
        </Button>
      )}

      {resultMessage && (
        <p
          className={`text-sm ${
            bookmarkStatus === "error" || historyStatus === "error"
              ? "text-destructive"
              : bookmarkStatus === "cancelled" || historyStatus === "cancelled"
                ? "text-warning"
                : "text-success"
          }`}
        >
          {resultMessage}
        </p>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={handleResetSync}
        disabled={isImporting}
      >
        Reset Sync Timestamps
      </Button>
    </div>
  );
}
