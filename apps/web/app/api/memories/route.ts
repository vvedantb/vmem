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

// GET /api/memories - Fetch all memories
export async function GET() {
  const token = await getConvexToken();
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    await ensureConvexUser(token);
    const data = await fetchQuery(api.memories.listMy, {}, { token });

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
  const token = await getConvexToken();
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    await ensureConvexUser(token);

    const body = await request.json();
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content =
      typeof body?.content === "string" ? body.content.trim() : "";
    const tags = Array.isArray(body?.tags)
      ? body.tags.filter((tag: unknown) => typeof tag === "string")
      : [];

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Title is required" },
        { status: 400 },
      );
    }

    if (!content) {
      return NextResponse.json(
        { success: false, error: "Content is required" },
        { status: 400 },
      );
    }

    const created = await fetchMutation(
      api.memories.createMy,
      {
        title,
        content,
        tags,
      },
      { token },
    );

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
