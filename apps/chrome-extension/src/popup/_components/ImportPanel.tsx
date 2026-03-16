import { useState, useEffect } from "react";
import {
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Progress,
} from "@vmem/ui";
import type {
  ContentMessage,
  BackgroundResponse,
  ProgressMessage,
} from "@/types/messages";

type ImportStatus = "idle" | "importing" | "done" | "error" | "cancelled";

export function ImportPanel() {
  const [historyDays, setHistoryDays] = useState("7");
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
      days: Number(historyDays),
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
        <Button
          variant="outline"
          className="w-full"
          onClick={handleImportBookmarks}
          disabled={isImporting}
        >
          {bookmarkStatus === "importing"
            ? "Importing..."
            : "Import All Bookmarks"}
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Browsing History
        </h3>
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
            {historyStatus === "importing" ? "Importing..." : "Import History"}
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
          Cancel Import
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
    </div>
  );
}
