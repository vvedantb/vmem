import { useState, useEffect } from "react";
import { IconBookmark, IconHistory } from "@tabler/icons-react";
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
import { useExtensionUserSettings } from "@/popup/useExtensionUserSettings";

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

function formatNextSync(scheduledTime: number): string {
  const diffMs = scheduledTime - Date.now();
  if (diffMs <= 0) return "any moment";
  const diffMin = Math.ceil(diffMs / 60000);
  if (diffMin === 1) return "in 1 min";
  if (diffMin < 60) return `in ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (remMin === 0) return `in ${diffHrs}h`;
  return `in ${diffHrs}h ${remMin}m`;
}

export function ImportPanel() {
  const { settings, update } = useExtensionUserSettings();
  const [historyDays, setHistoryDays] = useState("7");
  const [bookmarkStatus, setBookmarkStatus] = useState<ImportStatus>("idle");
  const [historyStatus, setHistoryStatus] = useState<ImportStatus>("idle");
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [lastBookmarkSync, setLastBookmarkSync] = useState(0);
  const [lastHistorySync, setLastHistorySync] = useState(0);
  const [nextSyncLabel, setNextSyncLabel] = useState<string | null>(null);

  useEffect(() => {
    void getStorage().then((storage) => {
      setLastBookmarkSync(storage.lastBookmarkSync);
      setLastHistorySync(storage.lastHistorySync);
    });

    // Fetch the next scheduled alarm time and keep it updated
    function updateNextSync() {
      chrome.alarms.get("vmem-history-sync", (alarm) => {
        if (alarm) {
          setNextSyncLabel(formatNextSync(alarm.scheduledTime));
        } else {
          setNextSyncLabel(null);
        }
      });
    }
    updateNextSync();
    const interval = setInterval(updateNextSync, 15_000);
    return () => clearInterval(interval);
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
    void update({ extensionAutoSyncEnabled: checked });
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
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Auto-sync</span>
          <Switch
            checked={settings?.extensionAutoSyncEnabled ?? true}
            onCheckedChange={handleAutoSyncToggle}
            disabled={settings === undefined}
          />
        </div>
        {settings?.extensionAutoSyncEnabled !== false && nextSyncLabel && (
          <p className="text-xs text-muted-foreground">
            Next sync {nextSyncLabel}
          </p>
        )}
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
          className="w-full"
          onClick={handleImportBookmarks}
          disabled={isImporting}
        >
          <IconBookmark size={16} />
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
            className="flex-1"
            onClick={handleImportHistory}
            disabled={isImporting}
          >
            <IconHistory size={16} />
            {historyStatus === "importing" ? "Syncing..." : "Sync History"}
          </Button>
        </div>
      </div>

      {progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="tabular-nums">
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
