import { useState, useEffect } from "react";
import type {
  ContentMessage,
  BackgroundResponse,
  ProgressMessage,
} from "@/types/messages";

type ImportStatus = "idle" | "importing" | "done" | "error" | "cancelled";

export function ImportPanel() {
  const [historyDays, setHistoryDays] = useState(7);
  const [bookmarkStatus, setBookmarkStatus] = useState<ImportStatus>("idle");
  const [historyStatus, setHistoryStatus] = useState<ImportStatus>("idle");
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    function handleProgress(message: ProgressMessage) {
      if (message.type === "IMPORT_PROGRESS") {
        setProgress({ current: message.current, total: message.total });
      }
    }

    chrome.runtime.onMessage.addListener(handleProgress);
    return () => chrome.runtime.onMessage.removeListener(handleProgress);
  }, []);

  function handleImportBookmarks() {
    setBookmarkStatus("importing");
    setProgress(null);
    setResultMessage(null);

    const message: ContentMessage = { type: "IMPORT_BOOKMARKS" };
    chrome.runtime.sendMessage(
      message,
      (response: BackgroundResponse | undefined) => {
        if (response?.type === "IMPORT_RESULT") {
          if (bookmarkStatus === "importing") {
            setBookmarkStatus(response.success ? "done" : "error");
          }
          setResultMessage(
            response.success
              ? `Imported ${response.count} bookmarks`
              : (response.error ?? "Import failed"),
          );
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
      days: historyDays,
    };
    chrome.runtime.sendMessage(
      message,
      (response: BackgroundResponse | undefined) => {
        if (response?.type === "IMPORT_RESULT") {
          if (historyStatus === "importing") {
            setHistoryStatus(response.success ? "done" : "error");
          }
          setResultMessage(
            response.success
              ? `Imported ${response.count} history entries`
              : (response.error ?? "Import failed"),
          );
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
      `Cancelled — ${progress?.current ?? 0} items imported before stopping`,
    );
    setProgress(null);
  }

  const isImporting =
    bookmarkStatus === "importing" || historyStatus === "importing";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Bookmarks</h3>
        <button
          type="button"
          onClick={handleImportBookmarks}
          disabled={isImporting}
          className="w-full glass-interactive text-foreground disabled:opacity-50 rounded-xl py-2.5 text-sm font-medium"
        >
          {bookmarkStatus === "importing"
            ? "Importing..."
            : "Import All Bookmarks"}
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Browsing History
        </h3>
        <div className="flex gap-2">
          <select
            value={historyDays}
            onChange={(e) => setHistoryDays(Number(e.target.value))}
            disabled={isImporting}
            className="bg-card border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-muted-foreground"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={handleImportHistory}
            disabled={isImporting}
            className="flex-1 glass-interactive text-foreground disabled:opacity-50 rounded-xl py-2.5 text-sm font-medium"
          >
            {historyStatus === "importing" ? "Importing..." : "Import History"}
          </button>
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
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all"
              style={{
                width: `${(progress.current / progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {isImporting && (
        <button
          type="button"
          onClick={handleCancel}
          className="w-full border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-xl py-2.5 text-sm font-medium"
        >
          Cancel Import
        </button>
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
    </div>
  );
}
