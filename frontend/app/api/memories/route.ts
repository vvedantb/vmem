import { NextRequest, NextResponse } from "next/server";

// In-memory store for mock data (will reset on server restart)
// This simulates a database for development purposes
const memories: Memory[] = [
  {
    id: "1",
    title: "First React Project",
    content:
      "Built my first React application today. Learned about components, props, and state management. The virtual DOM concept finally clicked!",
    tags: ["react", "learning", "javascript"],
    createdAt: new Date("2024-01-15").toISOString(),
  },
  {
    id: "2",
    title: "Docker Fundamentals",
    content:
      "Containerization with Docker. Key commands: docker build, docker run, docker-compose. Understood the difference between images and containers.",
    tags: ["docker", "devops"],
    createdAt: new Date("2024-01-20").toISOString(),
  },
  {
    id: "3",
    title: "TypeScript Tips",
    content:
      "TypeScript generics are powerful. Use them for reusable type-safe code. Also learned about utility types: Partial, Required, Pick, Omit.",
    tags: ["typescript", "tips"],
    createdAt: new Date("2024-02-05").toISOString(),
  },
];

interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

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
