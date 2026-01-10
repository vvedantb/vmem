import { NextRequest, NextResponse } from "next/server";
import { memories, type Memory } from "./store";

interface CreateMemoryRequest {
  title: string;
  content: string;
  tags: string[];
}

// GET /api/memories - Fetch all memories
export async function GET() {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  return NextResponse.json({
    success: true,
    data: memories,
    count: memories.length,
  });
}

// POST /api/memories - Create a new memory
export async function POST(request: NextRequest) {
  try {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const body: CreateMemoryRequest = await request.json();

    // Validation
    if (!body.title?.trim()) {
      return NextResponse.json(
        { success: false, error: "Title is required" },
        { status: 400 }
      );
    }

    if (!body.content?.trim()) {
      return NextResponse.json(
        { success: false, error: "Content is required" },
        { status: 400 }
      );
    }

    // Create new memory
    const newMemory: Memory = {
      id: Date.now().toString(),
      title: body.title.trim(),
      content: body.content.trim(),
      tags: body.tags || [],
      createdAt: new Date().toISOString(),
    };

    // Add to in-memory store
    memories.unshift(newMemory);

    return NextResponse.json(
      {
        success: true,
        data: newMemory,
        message: "Memory created successfully",
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
