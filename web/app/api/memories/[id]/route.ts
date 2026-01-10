import { NextRequest, NextResponse } from "next/server";
import { memories } from "../store";

interface UpdateMemoryRequest {
  title?: string;
  content?: string;
  tags?: string[];
}

// GET /api/memories/[id] - Fetch a single memory
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  const { id } = await params;
  const memory = memories.find((m) => m.id === id);

  if (!memory) {
    return NextResponse.json(
      { success: false, error: "Memory not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: memory,
  });
}

// PUT /api/memories/[id] - Update a memory
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 400));

    const { id } = await params;
    const memoryIndex = memories.findIndex((m) => m.id === id);

    if (memoryIndex === -1) {
      return NextResponse.json(
        { success: false, error: "Memory not found" },
        { status: 404 }
      );
    }

    const body: UpdateMemoryRequest = await request.json();

    // Validation
    if (body.title !== undefined && !body.title.trim()) {
      return NextResponse.json(
        { success: false, error: "Title cannot be empty" },
        { status: 400 }
      );
    }

    if (body.content !== undefined && !body.content.trim()) {
      return NextResponse.json(
        { success: false, error: "Content cannot be empty" },
        { status: 400 }
      );
    }

    // Update the memory
    const updatedMemory = {
      ...memories[memoryIndex],
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.content !== undefined && { content: body.content.trim() }),
      ...(body.tags !== undefined && { tags: body.tags }),
    };

    memories[memoryIndex] = updatedMemory;

    return NextResponse.json({
      success: true,
      data: updatedMemory,
      message: "Memory updated successfully",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// DELETE /api/memories/[id] - Delete a memory
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  const { id } = await params;
  const memoryIndex = memories.findIndex((m) => m.id === id);

  if (memoryIndex === -1) {
    return NextResponse.json(
      { success: false, error: "Memory not found" },
      { status: 404 }
    );
  }

  // Remove the memory
  memories.splice(memoryIndex, 1);

  return NextResponse.json({
    success: true,
    message: "Memory deleted successfully",
  });
}
