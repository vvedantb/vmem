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
    error,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    deleteNotification,
    fetchNotifications,
  } = useNotifications();

  if (error) {
    return (
      <PageContainer
        title="Notifications"
        description="Stay updated on your account activity"
      >
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
            <IconAlertCircle
              className="w-8 h-8 text-destructive"
              stroke={1.5}
            />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">
            Something went wrong
          </h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button
            variant="secondary"
            onClick={fetchNotifications}
            className="bg-muted"
          >
            Try again
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Notifications"
      description="Stay updated on your account activity"
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
              key={notification.id}
              className={`p-6 rounded-xl border transition-colors ${
                notification.read
                  ? "border-border bg-muted/50"
                  : "border-border/80 bg-accent"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${getIconBackground(
                    notification.type,
                  )}`}
                >
                  <NotificationIcon type={notification.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <h3
                      className={`font-medium ${
                        notification.read
                          ? "text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {notification.title}
                    </h3>
                    <span className="text-sm text-muted-foreground flex-shrink-0">
                      {notification.timestamp}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {notification.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                          onClick={() => markAsUnread(notification.id)}
                        >
                          <IconEyeOff size={16} stroke={1.5} />
                          Mark as unread
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => markAsRead(notification.id)}
                        >
                          <IconEye size={16} stroke={1.5} />
                          Mark as read
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteNotification(notification.id)}
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
