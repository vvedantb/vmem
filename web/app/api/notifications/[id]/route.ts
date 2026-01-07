import { NextRequest, NextResponse } from "next/server";
import { notifications, formatRelativeTime } from "../store";

// GET /api/notifications/[id] - Get a single notification
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  const notification = notifications.find((n) => n.id === id);

  if (!notification) {
    return NextResponse.json(
      { success: false, error: "Notification not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    notification: {
      ...notification,
      timestamp: formatRelativeTime(notification.createdAt),
    },
  });
}

// PUT /api/notifications/[id] - Update notification (mark as read/unread)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  const notification = notifications.find((n) => n.id === id);

  if (!notification) {
    return NextResponse.json(
      { success: false, error: "Notification not found" },
      { status: 404 }
    );
  }

  const body = await request.json();

  // Update read status if provided
  if (typeof body.read === "boolean") {
    notification.read = body.read;
  }

  return NextResponse.json({
    success: true,
    notification: {
      ...notification,
      timestamp: formatRelativeTime(notification.createdAt),
    },
  });
}

// DELETE /api/notifications/[id] - Delete a notification
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  const index = notifications.findIndex((n) => n.id === id);

  if (index === -1) {
    return NextResponse.json(
      { success: false, error: "Notification not found" },
      { status: 404 }
    );
  }

  notifications.splice(index, 1);

  return NextResponse.json({
    success: true,
    message: "Notification deleted",
  });
}
