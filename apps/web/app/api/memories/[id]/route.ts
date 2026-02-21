import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { convexMutation, convexQuery } from "@/lib/convex-server";

interface UpdateMemoryRequest {
  title?: string;
  content?: string;
  tags?: string[];
}

interface MemoryResponse {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

// GET /api/memories/[id] - Fetch a single memory
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiUser();
  if (session instanceof NextResponse) {
    return session;
  }

  const { id } = await params;

  void request;
  void session;

  try {
    const memory = await convexQuery<MemoryResponse | null>(
      "memories:getMyById",
      { id },
    );

    if (!memory) {
      return NextResponse.json(
        { success: false, error: "Memory not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: memory,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch memory" },
      { status: 500 },
    );
  }
}

// PUT /api/memories/[id] - Update a memory
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiUser();
  if (session instanceof NextResponse) {
    return session;
  }

  const { id } = await params;

  try {
    const body: UpdateMemoryRequest = await request.json();

    if (body.title !== undefined && !body.title.trim()) {
      return NextResponse.json(
        { success: false, error: "Title cannot be empty" },
        { status: 400 },
      );
    }

    if (body.content !== undefined && !body.content.trim()) {
      return NextResponse.json(
        { success: false, error: "Content cannot be empty" },
        { status: 400 },
      );
    }

    const updatedMemory = await convexMutation<MemoryResponse | null>(
      "memories:updateMy",
      {
        id,
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.content !== undefined ? { content: body.content.trim() } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
      },
    );

    if (!updatedMemory) {
      return NextResponse.json(
        { success: false, error: "Memory not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedMemory,
      message: "Memory updated successfully",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update memory";
    const status =
      message.includes("No updates") ||
      message.includes("cannot be empty") ||
      message.includes("required")
        ? 400
        : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// DELETE /api/memories/[id] - Delete a memory
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiUser();
  if (session instanceof NextResponse) {
    return session;
  }

  const { id } = await params;

  void request;
  void session;

  try {
    const deleted = await convexMutation<boolean>("memories:deleteMy", { id });

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Memory not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Memory deleted successfully",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to delete memory" },
      { status: 500 },
    );
  }
}
