import { NextRequest, NextResponse } from "next/server";
import {
  files,
  generateFileId,
  getFileType,
  type UploadedFile,
} from "./store";

// GET /api/files - Get all files
export async function GET() {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Calculate total storage used
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return NextResponse.json({
    data: files,
    totalBytes,
    storageLimit: 10 * 1024 * 1024 * 1024, // 10 GB
  });
}

// POST /api/files - Upload a new file
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Simulate upload delay based on file size (1 second per MB, min 500ms)
    const uploadTime = Math.max(500, Math.min(3000, file.size / 1000000 * 1000));
    await new Promise((resolve) => setTimeout(resolve, uploadTime));

    // Create thumbnail for images
    let thumbnailUrl: string | undefined;
    let previewContent: string | undefined;

    const fileType = getFileType(file.type);

    if (fileType === "image") {
      // For images, create a data URL placeholder
      // In a real app, this would be an actual thumbnail URL from cloud storage
      thumbnailUrl = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150' viewBox='0 0 200 150'%3E%3Crect fill='%23f0f0f0' width='200' height='150'/%3E%3Ctext fill='%23999' font-family='sans-serif' font-size='12' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3E${encodeURIComponent(file.name)}%3C/text%3E%3C/svg%3E`;
    } else if (fileType === "text") {
      // For text files, read content
      const text = await file.text();
      previewContent = text.substring(0, 1000);
    } else {
      previewContent = `Preview not available for ${file.name}`;
    }

    const newFile: UploadedFile = {
      id: generateFileId(),
      name: file.name,
      type: fileType,
      mimeType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      thumbnailUrl,
      previewContent,
    };

    // Add to beginning of array (newest first)
    files.unshift(newFile);

    return NextResponse.json({
      data: newFile,
      message: "File uploaded successfully",
    });
  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
