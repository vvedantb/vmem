import { NextResponse } from "next/server";
import { memories } from "@/app/api/memories/store";
import { notifications } from "@/app/api/notifications/store";

export type ActivityType =
  | "memory_created"
  | "memory_updated"
  | "memory_deleted"
  | "file_uploaded"
  | "sync_completed"
  | "api_key_created";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Format relative time for display
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

// GET /api/dashboard/activity - Get recent activity feed
export async function GET() {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 250));

  // Build activity items from various sources
  const activityItems: ActivityItem[] = [];

  // Add memory creation activities from recent memories
  const recentMemories = [...memories]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

  recentMemories.forEach((memory) => {
    activityItems.push({
      id: `memory_${memory.id}`,
      type: "memory_created",
      title: "Memory created",
      description: memory.title,
      timestamp: memory.createdAt,
      metadata: { memoryId: memory.id, tags: memory.tags },
    });
  });

  // Add some mock activity from notifications
  const relevantNotifs = notifications.filter(
    (n) =>
      n.title.toLowerCase().includes("sync") ||
      n.title.toLowerCase().includes("api key") ||
      n.title.toLowerCase().includes("file")
  );

  relevantNotifs.forEach((notif) => {
    let type: ActivityType = "memory_created";
    if (notif.title.toLowerCase().includes("sync")) type = "sync_completed";
    else if (notif.title.toLowerCase().includes("api key"))
      type = "api_key_created";
    else if (notif.title.toLowerCase().includes("file")) type = "file_uploaded";

    activityItems.push({
      id: `notif_${notif.id}`,
      type,
      title: notif.title,
      description: notif.description,
      timestamp: notif.createdAt,
    });
  });

  // Sort by timestamp (most recent first) and limit
  const sortedActivity = activityItems
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, 10);

  // Add formatted relative time
  const activityWithRelativeTime = sortedActivity.map((item) => ({
    ...item,
    relativeTime: formatRelativeTime(item.timestamp),
  }));

  return NextResponse.json({
    success: true,
    data: activityWithRelativeTime,
    count: activityWithRelativeTime.length,
  });
}
