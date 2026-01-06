// Shared in-memory store for files mock data
// This simulates a database for development purposes

export type FileType = "pdf" | "image" | "doc" | "excel" | "text" | "other";

export interface UploadedFile {
  id: string;
  name: string;
  type: FileType;
  mimeType: string;
  size: number; // bytes
  uploadedAt: string;
  // For images, we store a data URL for preview (in real app, this would be a URL to cloud storage)
  thumbnailUrl?: string;
  // Mock content for preview
  previewContent?: string;
}

// Helper to determine file type from mime type
export function getFileType(mimeType: string): FileType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType === "application/msword" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "doc";
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return "excel";
  if (mimeType.startsWith("text/")) return "text";
  return "other";
}

// Helper to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Generate unique ID
export function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Mock files data
export const files: UploadedFile[] = [
  {
    id: "file_1",
    name: "Project Requirements.pdf",
    type: "pdf",
    mimeType: "application/pdf",
    size: 2516582, // ~2.4 MB
    uploadedAt: new Date("2025-12-02").toISOString(),
    previewContent:
      "This is a mock PDF preview. In a real application, this would be the actual PDF content rendered in a viewer.",
  },
  {
    id: "file_2",
    name: "Team Photo.jpg",
    type: "image",
    mimeType: "image/jpeg",
    size: 1887436, // ~1.8 MB
    uploadedAt: new Date("2025-12-01").toISOString(),
    thumbnailUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'%3E%3Crect fill='%23f0f0f0' width='200' height='150'/%3E%3Ctext fill='%23999' font-family='sans-serif' font-size='14' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3ETeam Photo%3C/text%3E%3C/svg%3E",
  },
  {
    id: "file_3",
    name: "Q4 Budget.xlsx",
    type: "excel",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 876544, // ~856 KB
    uploadedAt: new Date("2025-11-28").toISOString(),
    previewContent:
      "Excel file containing Q4 budget projections and financial data.",
  },
  {
    id: "file_4",
    name: "Meeting Notes.docx",
    type: "doc",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 126976, // ~124 KB
    uploadedAt: new Date("2025-11-25").toISOString(),
    previewContent:
      "Meeting notes from the weekly sync:\n\n1. Project status update\n2. Timeline review\n3. Resource allocation\n4. Next steps and action items",
  },
  {
    id: "file_5",
    name: "Architecture Diagram.png",
    type: "image",
    mimeType: "image/png",
    size: 3355443, // ~3.2 MB
    uploadedAt: new Date("2025-11-20").toISOString(),
    thumbnailUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'%3E%3Crect fill='%23e8f4fd' width='200' height='150'/%3E%3Ctext fill='%23666' font-family='sans-serif' font-size='12' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EArchitecture Diagram%3C/text%3E%3C/svg%3E",
  },
];

// Track upload simulations for cleanup
export const uploadSimulations = new Map<string, NodeJS.Timeout>();
