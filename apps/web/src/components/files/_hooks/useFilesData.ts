"use client";

import { useCallback, useEffect, useState } from "react";
import type { FileItem } from "@/lib/file-types";
import { deleteFile, listFiles } from "../filesApi";

interface UseFilesDataResult {
  allFiles: FileItem[];
  isLoading: boolean;
  totalBytes: number;
  storageLimit: number;
  refreshFiles: () => Promise<void>;
  removeFileLocally: (id: string) => void;
  addFileLocally: (file: FileItem) => void;
  updateFilesLocally: (updater: (prev: FileItem[]) => FileItem[]) => void;
}

/**
 * Files REST data layer. Uses local state until a Convex files table exists;
 * keeps fetch/delete mechanics out of the route orchestrator.
 */
export function useFilesData(): UseFilesDataResult {
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBytes, setTotalBytes] = useState(0);
  const [storageLimit, setStorageLimit] = useState(10 * 1024 * 1024 * 1024);

  const refreshFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listFiles();
      setAllFiles(result.data);
      setTotalBytes(result.totalBytes);
      setStorageLimit(result.storageLimit);
    } catch {
      setAllFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  const removeFileLocally = useCallback((id: string) => {
    setAllFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) {
        setTotalBytes((bytes) => bytes - target.size);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const addFileLocally = useCallback((file: FileItem) => {
    setAllFiles((prev) => [file, ...prev]);
    setTotalBytes((prev) => prev + file.size);
  }, []);

  const updateFilesLocally = useCallback(
    (updater: (prev: FileItem[]) => FileItem[]) => {
      setAllFiles(updater);
    },
    [],
  );

  return {
    allFiles,
    isLoading,
    totalBytes,
    storageLimit,
    refreshFiles,
    removeFileLocally,
    addFileLocally,
    updateFilesLocally,
  };
}

export { deleteFile };
