import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { convexMutation, convexQuery } from "@/lib/convex-server";

interface CreateMemoryRequest {
  title: string;
  content: string;
  tags: string[];
}

interface MemoryResponse {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

// GET /api/memories - Fetch all memories
export async function GET(request: NextRequest) {
  const session = await requireApiUser();
  if (session instanceof NextResponse) {
    return session;
  }

  void request;
  void session;

  try {
    const data = await convexQuery<MemoryResponse[]>("memories:listMy");

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch memories" },
      { status: 500 },
    );
  }
}

// POST /api/memories - Create a new memory
export async function POST(request: NextRequest) {
  const session = await requireApiUser();
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const body: CreateMemoryRequest = await request.json();

    if (!body.title?.trim()) {
      return NextResponse.json(
        { success: false, error: "Title is required" },
        { status: 400 },
      );
    }

    if (!body.content?.trim()) {
      return NextResponse.json(
        { success: false, error: "Content is required" },
        { status: 400 },
      );
    }

    const created = await convexMutation<MemoryResponse>("memories:createMy", {
      title: body.title.trim(),
      content: body.content.trim(),
      tags: body.tags ?? [],
    });

    return NextResponse.json(
      {
        success: true,
        data: created,
        message: "Memory created successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create memory";
    const status = message.includes("required") ? 400 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
