"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Progress,
  Badge,
} from "@vmem/ui";
import { toast } from "sonner";
import {
  IconDownload,
  IconLoader2,
  IconCheck,
  IconFile,
  IconTable,
} from "@tabler/icons-react";

interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportFormat = "json" | "csv";
type DateRange = "all" | "week" | "month" | "year";

export default function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
    }
  }, [isOpen]);

  const fetchMemories = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/memories");
      const data = await response.json();
      if (data.data) {
        setMemories(data.data);
        const tags = new Set<string>();
        data.data.forEach((memory: Memory) => {
          memory.tags.forEach((tag: string) => tags.add(tag));
        });
        setAvailableTags(Array.from(tags).sort());
      }
    } catch {
      toast.error("Failed to load memories");
    } finally {
      setIsLoading(false);
    }
  };

  const filterMemories = useCallback(() => {
    let filtered = [...memories];

    if (dateRange !== "all") {
      const now = new Date();
      let cutoff: Date;
      switch (dateRange) {
        case "week":
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "year":
          cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoff = new Date(0);
      }
      filtered = filtered.filter(
        (memory) => new Date(memory.createdAt) >= cutoff,
      );
    }

    if (selectedTags.length > 0) {
      filtered = filtered.filter((memory) =>
        selectedTags.some((tag) => memory.tags.includes(tag)),
      );
    }

    return filtered;
  }, [memories, dateRange, selectedTags]);

  const generateJSON = useCallback((data: Memory[]): string => {
    return JSON.stringify(
      {
        exportDate: new Date().toISOString(),
        count: data.length,
        memories: data,
      },
      null,
      2,
    );
  }, []);

  const generateCSV = useCallback((data: Memory[]): string => {
    const headers = ["id", "title", "content", "tags", "createdAt"];
    const escapeCSV = (value: string): string => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const rows = data.map((memory) => [
      escapeCSV(memory.id),
      escapeCSV(memory.title),
      escapeCSV(memory.content),
      escapeCSV(memory.tags.join("; ")),
      escapeCSV(memory.createdAt),
    ]);

    return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  }, []);

  const downloadFile = useCallback(
    (content: string, filename: string, mimeType: string) => {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [],
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setExportProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);

      const filteredMemories = filterMemories();

      if (filteredMemories.length === 0) {
        clearInterval(progressInterval);
        setIsExporting(false);
        setExportProgress(0);
        toast.warning("No memories match the selected filters");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 800));

      clearInterval(progressInterval);
      setExportProgress(100);

      const timestamp = new Date().toISOString().split("T")[0];
      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === "json") {
        content = generateJSON(filteredMemories);
        filename = `vmemory-export-${timestamp}.json`;
        mimeType = "application/json";
      } else {
        content = generateCSV(filteredMemories);
        filename = `vmemory-export-${timestamp}.csv`;
        mimeType = "text/csv";
      }

      downloadFile(content, filename, mimeType);

      toast.success(
        `Successfully exported ${filteredMemories.length} memories`,
      );

      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        onClose();
      }, 500);
    } catch (err) {
      setIsExporting(false);
      setExportProgress(0);
      toast.error(
        err instanceof Error ? err.message : "Failed to export memories",
      );
    }
  }, [
    format,
    filterMemories,
    generateJSON,
    generateCSV,
    downloadFile,
    onClose,
  ]);

  const handleClose = useCallback(() => {
    if (!isExporting) {
      setFormat("json");
      setDateRange("all");
      setSelectedTags([]);
      setExportProgress(0);
      onClose();
    }
  }, [isExporting, onClose]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const filteredCount = filterMemories().length;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        hideCloseButton={isExporting}
        onInteractOutside={(e) => {
          if (isExporting) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isExporting) e.preventDefault();
        }}
        className="bg-card border border-border"
      >
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-foreground">Export Memories</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <IconLoader2
              size={24}
              className="animate-spin text-muted-foreground"
            />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Export Format
              </label>
              <Select
                value={format}
                onValueChange={(value: string) =>
                  setFormat(
                    value === "json" || value === "csv" ? value : "json",
                  )
                }
                disabled={isExporting}
              >
                <SelectTrigger className="bg-muted/50 border border-border shadow-none hover:bg-accent text-foreground">
                  <div className="flex items-center gap-2">
                    {format === "json" ? (
                      <IconFile size={18} className="text-muted-foreground" />
                    ) : (
                      <IconTable size={18} className="text-muted-foreground" />
                    )}
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">
                    <div className="flex items-center gap-2">
                      <IconFile size={18} />
                      <span>JSON - Full data with structure</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2">
                      <IconTable size={18} />
                      <span>CSV - Spreadsheet compatible</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Date Range
              </label>
              <Select
                value={dateRange}
                onValueChange={(value: string) =>
                  setDateRange(
                    value === "all" ||
                      value === "week" ||
                      value === "month" ||
                      value === "year"
                      ? value
                      : "all",
                  )
                }
                disabled={isExporting}
              >
                <SelectTrigger className="bg-muted/50 border border-border shadow-none hover:bg-accent text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="year">Last Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Filter by Tags (optional)
              </label>
              {availableTags.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {availableTags.map((tag) => (
                    <Badge
                      key={tag}
                      className={`cursor-pointer transition-colors ${
                        selectedTags.includes(tag)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted border border-border text-muted-foreground"
                      }`}
                      onClick={() => !isExporting && toggleTag(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No tags available
                </p>
              )}
            </div>

            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {filteredCount}
                </span>{" "}
                {filteredCount === 1 ? "memory" : "memories"} will be exported
              </p>
            </div>

            {isExporting && (
              <div className="space-y-2">
                <Progress value={exportProgress} className="h-1.5 bg-muted" />
                <p className="text-sm text-muted-foreground text-center">
                  {exportProgress < 100
                    ? "Generating export file..."
                    : "Export complete!"}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isExporting}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || isLoading || filteredCount === 0}
            className="bg-primary text-primary-foreground"
          >
            {isExporting ? (
              exportProgress === 100 ? (
                <IconCheck size={16} />
              ) : (
                <IconLoader2 size={16} className="animate-spin" />
              )
            ) : (
              <IconDownload size={16} />
            )}
            {isExporting
              ? exportProgress === 100
                ? "Done!"
                : "Exporting..."
              : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
