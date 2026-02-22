import { auth } from "@clerk/nextjs/server";
import { api } from "@vmem/backend";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { NextRequest, NextResponse } from "next/server";

async function getConvexToken(): Promise<string | null> {
  const session = await auth();

  if (!session.userId) {
    return null;
  }

  return await session.getToken({ template: "convex" });
}

async function ensureConvexUser(token: string): Promise<void> {
  await fetchMutation(api.auth.ensureUserExists, {}, { token });
}

// GET /api/memories/[id] - Fetch a single memory
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await getConvexToken();
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  void request;

  try {
    await ensureConvexUser(token);
    const memory = await fetchQuery(api.memories.getMyById, { id }, { token });

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
  const token = await getConvexToken();
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  try {
    await ensureConvexUser(token);

    const body = await request.json();
    const hasTitle = body?.title !== undefined;
    const hasContent = body?.content !== undefined;
    const hasTags = body?.tags !== undefined;

    const title =
      hasTitle && typeof body.title === "string"
        ? body.title.trim()
        : undefined;
    const content =
      hasContent && typeof body.content === "string"
        ? body.content.trim()
        : undefined;
    const tags =
      hasTags && Array.isArray(body.tags)
        ? body.tags.filter((tag: unknown) => typeof tag === "string")
        : undefined;

    if (hasTitle && !title) {
      return NextResponse.json(
        { success: false, error: "Title cannot be empty" },
        { status: 400 },
      );
    }

    if (hasContent && !content) {
      return NextResponse.json(
        { success: false, error: "Content cannot be empty" },
        { status: 400 },
      );
    }

    if (!hasTitle && !hasContent && !hasTags) {
      return NextResponse.json(
        { success: false, error: "No updates provided" },
        { status: 400 },
      );
    }

    const updatedMemory = await fetchMutation(
      api.memories.updateMy,
      {
        id,
        ...(hasTitle ? { title } : {}),
        ...(hasContent ? { content } : {}),
        ...(hasTags ? { tags } : {}),
      },
      { token },
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
  const token = await getConvexToken();
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  void request;

  try {
    await ensureConvexUser(token);
    const deleted = await fetchMutation(
      api.memories.deleteMy,
      { id },
      { token },
    );

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
