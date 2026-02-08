import { NextRequest, NextResponse } from "next/server";
import { files } from "../store";

// GET /api/files/[id] - Get a single file
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  const file = files.find((f) => f.id === id);

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({ data: file });
}

// DELETE /api/files/[id] - Delete a file
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  const fileIndex = files.findIndex((f) => f.id === id);

  if (fileIndex === -1) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Remove from array
  files.splice(fileIndex, 1);

  return NextResponse.json({
    message: "File deleted successfully",
  });
}
