import { NextResponse } from "next/server";
import { memories } from "../store";

export interface TagStats {
  tag: string;
  count: number;
}

// GET /api/memories/tags - Get all unique tags with counts
export async function GET() {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  try {
    // Count occurrences of each tag
    const tagCounts = new Map<string, number>();

    memories.forEach((memory) => {
      memory.tags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    // Convert to array and sort by count (descending)
    const tags: TagStats[] = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      data: tags,
      totalTags: tags.length,
      totalMemories: memories.length,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch tags" },
      { status: 500 }
    );
  }
}

// PUT /api/memories/tags - Rename a tag across all memories
export async function PUT(request: Request) {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const { oldTag, newTag } = await request.json();

    if (!oldTag || !newTag) {
      return NextResponse.json(
        { success: false, error: "Both oldTag and newTag are required" },
        { status: 400 }
      );
    }

    const normalizedOld = oldTag.trim().toLowerCase();
    const normalizedNew = newTag.trim().toLowerCase();

    if (normalizedOld === normalizedNew) {
      return NextResponse.json(
        { success: false, error: "New tag name must be different" },
        { status: 400 }
      );
    }

    let updatedCount = 0;

    memories.forEach((memory) => {
      const tagIndex = memory.tags.indexOf(normalizedOld);
      if (tagIndex !== -1) {
        // Check if new tag already exists in this memory
        if (!memory.tags.includes(normalizedNew)) {
          memory.tags[tagIndex] = normalizedNew;
        } else {
          // Remove the old tag if new tag already exists
          memory.tags.splice(tagIndex, 1);
        }
        updatedCount++;
      }
    });

    return NextResponse.json({
      success: true,
      message: `Tag renamed from "${normalizedOld}" to "${normalizedNew}"`,
      updatedMemories: updatedCount,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to rename tag" },
      { status: 500 }
    );
  }
}

// DELETE /api/memories/tags - Delete a tag from all memories
export async function DELETE(request: Request) {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const { tag } = await request.json();

    if (!tag) {
      return NextResponse.json(
        { success: false, error: "Tag is required" },
        { status: 400 }
      );
    }

    const normalizedTag = tag.trim().toLowerCase();
    let deletedCount = 0;

    memories.forEach((memory) => {
      const tagIndex = memory.tags.indexOf(normalizedTag);
      if (tagIndex !== -1) {
        memory.tags.splice(tagIndex, 1);
        deletedCount++;
      }
    });

    return NextResponse.json({
      success: true,
      message: `Tag "${normalizedTag}" deleted`,
      updatedMemories: deletedCount,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to delete tag" },
      { status: 500 }
    );
  }
}
