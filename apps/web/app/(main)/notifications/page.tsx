"use client";

import {
  Button,
  Skeleton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@vmem/ui";
import {
  IconCheck,
  IconAlertTriangle,
  IconAlertCircle,
  IconInfoCircle,
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconTrash,
  IconBellOff,
} from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { useNotifications } from "@/components/contexts/NotificationContext";
import type { NotificationType } from "@/components/contexts/NotificationContext";

function formatTimestamp(createdAt: number): string {
  const now = Date.now();
  const diffMs = now - createdAt;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(createdAt).toLocaleDateString();
}

function NotificationIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case "success":
      return <IconCheck className="w-5 h-5 text-success" stroke={1.5} />;
    case "warning":
      return (
        <IconAlertTriangle className="w-5 h-5 text-warning" stroke={1.5} />
      );
    case "error":
      return (
        <IconAlertCircle className="w-5 h-5 text-destructive" stroke={1.5} />
      );
    case "info":
    default:
      return <IconInfoCircle className="w-5 h-5 text-info" stroke={1.5} />;
  }
}

function getIconBackground(type: NotificationType) {
  switch (type) {
    case "success":
      return "bg-success/10";
    case "warning":
      return "bg-warning/10";
    case "error":
      return "bg-destructive/10";
    case "info":
    default:
      return "bg-info/10";
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-6 rounded-xl border border-border">
          <div className="flex items-start gap-4">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48 rounded" />
              <Skeleton className="h-3 w-72 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <IconBellOff className="w-8 h-8 text-muted-foreground" stroke={1.5} />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-1">
        No notifications
      </h3>
      <p className="text-sm text-muted-foreground">
        You&apos;re all caught up! Check back later for updates.
      </p>
    </div>
  );
}

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  return (
    <PageContainer
      title="Notifications"
      rightSection={
        unreadCount > 0 ? (
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={markAllAsRead}
          >
            Mark all as read
          </Button>
        ) : null
      }
    >
      {isLoading ? (
        <LoadingSkeleton />
      ) : notifications.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification._id}
              className={`p-3 sm:p-6 rounded-xl border transition-colors ${
                notification.read
                  ? "border-border bg-muted/50"
                  : "border-border/80 bg-accent"
              }`}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${getIconBackground(
                    notification.type,
                  )}`}
                >
                  <NotificationIcon type={notification.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-4">
                    <h3
                      className={`font-medium text-sm sm:text-base ${
                        notification.read
                          ? "text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {notification.title}
                    </h3>
                    <span className="text-xs sm:text-sm text-muted-foreground flex-shrink-0">
                      {formatTimestamp(notification.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    {notification.description}
                  </p>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  {!notification.read && (
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <IconDotsVertical size={18} stroke={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {notification.read ? (
                        <DropdownMenuItem
                          onClick={() => markAsUnread(notification._id)}
                        >
                          <IconEyeOff size={16} stroke={1.5} />
                          Mark as unread
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => markAsRead(notification._id)}
                        >
                          <IconEye size={16} stroke={1.5} />
                          Mark as read
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteNotification(notification._id)}
                      >
                        <IconTrash size={16} stroke={1.5} />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
