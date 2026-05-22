import type { FileItem } from "@/lib/file-types";

interface FilesListResponse {
  data: FileItem[];
  totalBytes: number;
  storageLimit: number;
}

const DEFAULT_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024;

export async function listFiles(): Promise<FilesListResponse> {
  const response = await fetch("/api/files");
  if (!response.ok) {
    return { data: [], totalBytes: 0, storageLimit: DEFAULT_STORAGE_LIMIT };
  }
  const data = await response.json();
  return {
    data: data.data ?? [],
    totalBytes: data.totalBytes ?? 0,
    storageLimit: data.storageLimit ?? DEFAULT_STORAGE_LIMIT,
  };
}

export async function deleteFile(id: string): Promise<void> {
  const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error ?? "Failed to delete");
  }
}
