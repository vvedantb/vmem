import {
  Button,
  Skeleton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  cn,
} from "@vmem/ui";
import {
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconTrash,
} from "@tabler/icons-react";
import {
  AnimatedNotificationIcon,
  AnimatedBellIcon,
} from "@/components/svg-animations";
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
  return <AnimatedNotificationIcon type={type} size={20} />;
}

function getIconBackground(type: NotificationType) {
  switch (type) {
    case "success":
      return "bg-success/10";
    case "warning":
      return "bg-warning/10";
    case "error":
      return "bg-danger/10";
    case "info":
    default:
      return "bg-accent/10";
  }
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-start gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-surface-secondary">
        <AnimatedBellIcon size={32} className="text-muted" muted />
      </div>
      <h3 className="mb-1 text-lg font-medium text-foreground text-balance">
        No notifications
      </h3>
      <p className="text-sm text-muted">
        You&apos;re all caught up! Check back later for updates.
      </p>
    </div>
  );
}

export function NotificationsPanel() {
  const {
    notifications,
    isLoading,
    markAsRead,
    markAsUnread,
    deleteNotification,
  } = useNotifications();

  if (isLoading) return <LoadingSkeleton />;
  if (notifications.length === 0) return <EmptyState />;

  return (
    <div className="flex flex-col gap-1">
      {notifications.map((notification) => (
        <div
          key={notification._id}
          className="rounded-lg px-3 py-2.5 transition-[background-color] hover:bg-surface-tertiary/50 sm:px-4 sm:py-3"
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <div
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-lg ${getIconBackground(
                notification.type,
              )}`}
            >
              <NotificationIcon type={notification.type} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-4">
                <h3
                  className={cn(
                    "text-sm font-medium sm:text-base",
                    notification.read ? "text-muted" : "text-foreground",
                  )}
                >
                  {notification.title}
                </h3>
                <span className="flex-shrink-0 text-xs text-muted sm:text-sm tabular-nums">
                  {formatTimestamp(notification.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted sm:text-sm">
                {notification.description}
              </p>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {!notification.read && (
                <div className="h-2 w-2 flex-shrink-0 rounded-full bg-surface-tertiary" />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted hover:text-foreground"
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
                    className="text-danger focus:text-danger data-[highlighted]:text-danger"
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
  );
}

/**
 * Right-section action specific to the notifications tab — a single
 * "mark all as read" button that only appears when at least one item
 * is unread. The badge in the sidebar already covers the count.
 */
export function NotificationsRightSection() {
  const { unreadCount, markAllAsRead } = useNotifications();
  if (unreadCount === 0) return null;
  return (
    <Button
      variant="ghost"
      className="text-muted hover:text-foreground"
      onClick={markAllAsRead}
    >
      Mark all as read
    </Button>
  );
}
