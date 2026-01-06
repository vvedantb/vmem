import { NextResponse } from "next/server";
import { notifications, formatRelativeTime } from "./store";

// GET /api/notifications - Fetch all notifications
export async function GET() {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Format notifications with relative timestamps
  const formattedNotifications = notifications
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((notification) => ({
      ...notification,
      timestamp: formatRelativeTime(notification.createdAt),
    }));

  return NextResponse.json({
    success: true,
    notifications: formattedNotifications,
    unreadCount,
    total: notifications.length,
  });
}

// PUT /api/notifications - Mark all as read
export async function PUT() {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Mark all notifications as read
  notifications.forEach((notification) => {
    notification.read = true;
  });

  return NextResponse.json({
    success: true,
    message: "All notifications marked as read",
  });
}
