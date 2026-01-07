// Shared in-memory store for notifications mock data
// This simulates a database for development purposes

export type NotificationType = "success" | "warning" | "error" | "info";

export interface Notification {
  id: string;
  title: string;
  description: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
}

// Generate a unique notification ID
export function generateNotificationId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Format relative time for display
export function formatRelativeTime(dateString: string): string {
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

// Initial mock data
export const notifications: Notification[] = [
  {
    id: "notif_1",
    title: "Memory limit approaching",
    description: "You've used 80% of your memory storage quota.",
    type: "warning",
    read: false,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  },
  {
    id: "notif_2",
    title: "New API key created",
    description: "A new API key 'Production App' was created successfully.",
    type: "success",
    read: false,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
  {
    id: "notif_3",
    title: "Weekly summary ready",
    description: "Your weekly memory activity report is now available.",
    type: "info",
    read: true,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  },
  {
    id: "notif_4",
    title: "Security alert",
    description: "Unusual API activity detected from a new IP address.",
    type: "error",
    read: true,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
  },
  {
    id: "notif_5",
    title: "Sync completed",
    description: "Google Drive connector synced 42 new files.",
    type: "success",
    read: false,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 mins ago
  },
  {
    id: "notif_6",
    title: "New memory created",
    description: "Voice memo transcribed and saved to your memories.",
    type: "info",
    read: true,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
  },
];
