import { useState, useEffect } from "react";
import { IconBookmark, IconHistory } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Progress,
} from "@vmem/ui";
import { formatRelativeTime, formatTimeUntil } from "@vmem/shared";
import type {
  ContentMessage,
  BackgroundResponse,
  ProgressMessage,
} from "@/types/messages";
import { getStorage, setStorage } from "@/lib/storage";
import { useExtensionUserSettings } from "@/popup/useExtensionUserSettings";
import { SettingsSwitchRow } from "./SettingsSwitchRow";

type ImportStatus = "idle" | "importing" | "done" | "error" | "cancelled";

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

  function refreshSyncTimestamps() {
    void getStorage().then((storage) => {
      setLastBookmarkSync(storage.lastBookmarkSync);
      setLastHistorySync(storage.lastHistorySync);
    });
  }

  useEffect(() => {
    refreshSyncTimestamps();

    function updateNextSync() {
      chrome.alarms.get("vmem-history-sync", (alarm) => {
        if (alarm) {
          setNextSyncLabel(formatTimeUntil(alarm.scheduledTime));
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
    void setStorage({ autoSyncEnabled: checked });
    void update({ extensionAutoSyncEnabled: checked });
  }

  function runImport(options: {
    message: ContentMessage;
    setStatus: (status: ImportStatus) => void;
    successMessage: (count: number) => string;
    onSettled: () => void;
  }) {
    options.setStatus("importing");
    setProgress(null);
    setResultMessage(null);

    chrome.runtime.sendMessage(
      options.message,
      (response: BackgroundResponse | undefined) => {
        if (response?.type === "IMPORT_RESULT") {
          if (response.locked) {
            options.setStatus("idle");
            setResultMessage("Sync already in progress");
          } else {
            options.setStatus(response.success ? "done" : "error");
            setResultMessage(
              response.success
                ? options.successMessage(response.count)
                : (response.error ?? "Sync failed"),
            );
            options.onSettled();
          }
        }
        setProgress(null);
      },
    );
  }

  function handleImportBookmarks() {
    runImport({
      message: { type: "IMPORT_BOOKMARKS" },
      setStatus: setBookmarkStatus,
      successMessage: (count) => `Synced ${count} new bookmarks`,
      onSettled: () => setLastBookmarkSync(Date.now()),
    });
  }

  function handleImportHistory() {
    runImport({
      message: {
        type: "IMPORT_HISTORY",
        days: Number(historyDays),
      },
      setStatus: setHistoryStatus,
      successMessage: (count) => `Synced ${count} new history entries`,
      onSettled: () => setLastHistorySync(Date.now()),
    });
  }

  function handleCancel() {
    const message: ContentMessage = { type: "CANCEL_IMPORT" };
    void chrome.runtime.sendMessage(message);

    if (bookmarkStatus === "importing") setBookmarkStatus("cancelled");
    if (historyStatus === "importing") setHistoryStatus("cancelled");
    setResultMessage(
      `Cancelled — ${progress?.current ?? 0} items synced before stopping`,
    );
    setProgress(null);
  }

  const isImporting =
    bookmarkStatus === "importing" || historyStatus === "importing";

  function handleRunAutoSyncNow() {
    setResultMessage(null);
    chrome.runtime.sendMessage(
      { type: "DEBUG_RUN_AUTO_SYNC" },
      (response: BackgroundResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;
        refreshSyncTimestamps();
        if (runtimeError) {
          setResultMessage(
            `Background error: ${runtimeError.message}. Reload the extension at chrome://extensions`,
          );
          return;
        }
        if (response?.type === "DEBUG_SYNC_RESULT") {
          setLastHistorySync(response.lastHistorySync);
          setLastBookmarkSync(response.lastBookmarkSync);
          setResultMessage(
            "Auto-sync run finished — check last-sync times above",
          );
          return;
        }
        setResultMessage(
          "No response from background — reload the extension and try again",
        );
      },
    );
  }

  function handleResetSync() {
    void setStorage({ lastBookmarkSync: 0, lastHistorySync: 0 });
    setLastBookmarkSync(0);
    setLastHistorySync(0);
    setResultMessage(
      "Sync timestamps reset — next sync will include all items",
    );
  }

  const autoSyncEnabled = settings?.extensionAutoSyncEnabled ?? true;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-base font-medium text-foreground">Auto-sync</h3>
        <Card className="shadow-none">
          <CardContent className="space-y-4 p-4">
            <SettingsSwitchRow
              id="auto-sync-toggle"
              label="Sync bookmarks and history"
              description={
                autoSyncEnabled && nextSyncLabel
                  ? `Next sync ${nextSyncLabel}`
                  : "Periodically import new bookmarks and browsing history."
              }
              checked={autoSyncEnabled}
              onCheckedChange={handleAutoSyncToggle}
              disabled={settings === undefined}
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-foreground">Bookmarks</h3>
          <span className="text-xs text-muted">
            {formatRelativeTime(lastBookmarkSync, { empty: "Never synced" })}
          </span>
        </div>
        <Card className="shadow-none">
          <CardContent className="p-4">
            <Button
              className="w-full"
              onClick={handleImportBookmarks}
              disabled={isImporting}
            >
              <IconBookmark size={16} />
              {bookmarkStatus === "importing" ? "Syncing..." : "Sync bookmarks"}
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-foreground">
            Browsing history
          </h3>
          <span className="text-xs text-muted">
            {formatRelativeTime(lastHistorySync, { empty: "Never synced" })}
          </span>
        </div>
        <Card className="shadow-none">
          <CardContent className="space-y-3 p-4">
            <div className="flex gap-2">
              <Select
                value={historyDays}
                onValueChange={setHistoryDays}
                disabled={isImporting}
              >
                <SelectTrigger className="h-9 w-[140px]">
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
                {historyStatus === "importing" ? "Syncing..." : "Sync history"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {progress ? (
        <Card className="shadow-none">
          <CardContent className="space-y-2 p-4">
            <div className="flex justify-between text-xs text-muted">
              <span>Progress</span>
              <span className="tabular-nums">
                {progress.current} / {progress.total}
              </span>
            </div>
            <Progress value={(progress.current / progress.total) * 100} />
          </CardContent>
        </Card>
      ) : null}

      {isImporting ? (
        <Button variant="destructive" className="w-full" onClick={handleCancel}>
          Cancel sync
        </Button>
      ) : null}

      {resultMessage ? (
        <p
          className={`text-sm ${
            bookmarkStatus === "error" || historyStatus === "error"
              ? "text-danger"
              : bookmarkStatus === "cancelled" || historyStatus === "cancelled"
                ? "text-warning"
                : "text-success"
          }`}
        >
          {resultMessage}
        </p>
      ) : null}

      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleRunAutoSyncNow}
          disabled={isImporting}
        >
          Run auto-sync now
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted"
          onClick={handleResetSync}
          disabled={isImporting}
        >
          Reset sync timestamps
        </Button>
      </div>
    </div>
  );
}
