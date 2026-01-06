"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Select,
  SelectItem,
  Progress,
  Chip,
  addToast,
} from "@heroui/react";
import {
  IconDownload,
  IconX,
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

  // Fetch memories to get available tags and data
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
        // Extract unique tags
        const tags = new Set<string>();
        data.data.forEach((memory: Memory) => {
          memory.tags.forEach((tag: string) => tags.add(tag));
        });
        setAvailableTags(Array.from(tags).sort());
      }
    } catch {
      addToast({
        title: "Error",
        description: "Failed to load memories",
        color: "danger",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterMemories = useCallback(() => {
    let filtered = [...memories];

    // Filter by date range
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
        (memory) => new Date(memory.createdAt) >= cutoff
      );
    }

    // Filter by tags
    if (selectedTags.length > 0) {
      filtered = filtered.filter((memory) =>
        selectedTags.some((tag) => memory.tags.includes(tag))
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
      2
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
    []
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(0);

    try {
      // Simulate export progress
      const progressInterval = setInterval(() => {
        setExportProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);

      // Filter memories based on options
      const filteredMemories = filterMemories();

      if (filteredMemories.length === 0) {
        clearInterval(progressInterval);
        setIsExporting(false);
        setExportProgress(0);
        addToast({
          title: "No Data",
          description: "No memories match the selected filters",
          color: "warning",
        });
        return;
      }

      // Simulate processing delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      clearInterval(progressInterval);
      setExportProgress(100);

      // Generate file content
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

      // Download file
      downloadFile(content, filename, mimeType);

      // Show success
      addToast({
        title: "Export Complete",
        description: `Successfully exported ${filteredMemories.length} memories`,
        color: "success",
      });

      // Reset and close
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        onClose();
      }, 500);
    } catch (err) {
      setIsExporting(false);
      setExportProgress(0);
      addToast({
        title: "Export Failed",
        description:
          err instanceof Error ? err.message : "Failed to export memories",
        color: "danger",
      });
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
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const filteredCount = filterMemories().length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      isDismissable={!isExporting}
      classNames={{
        base: "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
        header: "border-b border-black/10 dark:border-white/10",
        body: "py-6",
        footer: "border-t border-black/10 dark:border-white/10",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center justify-between gap-4">
          <span className="text-neutral-800 dark:text-neutral-200 text-lg font-semibold">
            Export Memories
          </span>
          <Button
            size="sm"
            variant="light"
            isIconOnly
            onPress={handleClose}
            isDisabled={isExporting}
            className="text-neutral-500 flex-shrink-0"
          >
            <IconX size={18} />
          </Button>
        </ModalHeader>

        <ModalBody>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <IconLoader2 size={24} className="animate-spin text-neutral-400" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Format selection */}
              <div>
                <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2 block">
                  Export Format
                </label>
                <Select
                  selectedKeys={[format]}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0];
                    if (selected) setFormat(selected as ExportFormat);
                  }}
                  isDisabled={isExporting}
                  classNames={{
                    trigger:
                      "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04]",
                    value: "text-neutral-800 dark:text-neutral-200",
                    popoverContent:
                      "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
                  }}
                  startContent={
                    format === "json" ? (
                      <IconFile
                        size={18}
                        className="text-neutral-500"
                      />
                    ) : (
                      <IconTable size={18} className="text-neutral-500" />
                    )
                  }
                >
                  <SelectItem key="json" textValue="JSON">
                    <div className="flex items-center gap-2">
                      <IconFile size={18} />
                      <span>JSON - Full data with structure</span>
                    </div>
                  </SelectItem>
                  <SelectItem key="csv" textValue="CSV">
                    <div className="flex items-center gap-2">
                      <IconTable size={18} />
                      <span>CSV - Spreadsheet compatible</span>
                    </div>
                  </SelectItem>
                </Select>
              </div>

              {/* Date range selection */}
              <div>
                <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2 block">
                  Date Range
                </label>
                <Select
                  selectedKeys={[dateRange]}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0];
                    if (selected) setDateRange(selected as DateRange);
                  }}
                  isDisabled={isExporting}
                  classNames={{
                    trigger:
                      "bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 shadow-none data-[hover=true]:bg-black/[0.04] dark:data-[hover=true]:bg-white/[0.04]",
                    value: "text-neutral-800 dark:text-neutral-200",
                    popoverContent:
                      "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
                  }}
                >
                  <SelectItem key="all">All Time</SelectItem>
                  <SelectItem key="week">Last 7 Days</SelectItem>
                  <SelectItem key="month">Last 30 Days</SelectItem>
                  <SelectItem key="year">Last Year</SelectItem>
                </Select>
              </div>

              {/* Tag filter */}
              <div>
                <label className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2 block">
                  Filter by Tags (optional)
                </label>
                {availableTags.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {availableTags.map((tag) => (
                      <Chip
                        key={tag}
                        size="sm"
                        variant={selectedTags.includes(tag) ? "solid" : "flat"}
                        className={`cursor-pointer transition-colors ${
                          selectedTags.includes(tag)
                            ? "bg-black dark:bg-white text-white dark:text-black"
                            : "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-400"
                        }`}
                        onClick={() => !isExporting && toggleTag(tag)}
                      >
                        {tag}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400 dark:text-neutral-500">
                    No tags available
                  </p>
                )}
              </div>

              {/* Export preview */}
              <div className="p-4 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {filteredCount}
                  </span>{" "}
                  {filteredCount === 1 ? "memory" : "memories"} will be exported
                </p>
              </div>

              {/* Export progress */}
              {isExporting && (
                <div className="space-y-2">
                  <Progress
                    value={exportProgress}
                    size="sm"
                    classNames={{
                      track: "bg-black/10 dark:bg-white/10",
                      indicator: "bg-black dark:bg-white",
                    }}
                  />
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center">
                    {exportProgress < 100
                      ? "Generating export file..."
                      : "Export complete!"}
                  </p>
                </div>
              )}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            variant="light"
            onPress={handleClose}
            isDisabled={isExporting}
            className="text-neutral-600 dark:text-neutral-400"
          >
            Cancel
          </Button>
          <Button
            onPress={handleExport}
            isDisabled={isExporting || isLoading || filteredCount === 0}
            className="bg-black dark:bg-white text-white dark:text-black"
            startContent={
              isExporting ? (
                exportProgress === 100 ? (
                  <IconCheck size={16} />
                ) : (
                  <IconLoader2 size={16} className="animate-spin" />
                )
              ) : (
                <IconDownload size={16} />
              )
            }
          >
            {isExporting
              ? exportProgress === 100
                ? "Done!"
                : "Exporting..."
              : "Export"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
