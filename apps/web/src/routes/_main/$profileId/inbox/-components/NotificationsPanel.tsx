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
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import {
  AnimatedNotificationIcon,
  AnimatedBellIcon,
} from "@/components/icons/animations";
import { useNotifications } from "@/contexts/NotificationContext";
import type { NotificationType } from "@/contexts/NotificationContext";
import { formatRelativeTime } from "@vmem/shared";
import { tempId } from "@/lib/convex-optimistic";

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
              <AnimatedNotificationIcon type={notification.type} size={20} />
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
                  {formatRelativeTime(notification.createdAt)}
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

// right-section action specific to the notifications tab
export function NotificationsRightSection() {
  const { unreadCount, markAllAsRead } = useNotifications();
  const sendTest = useMutation(api.notifications.sendTest).withOptimisticUpdate(
    (localStore) => {
      const list = localStore.getQuery(api.notifications.listMy, {});
      const unread = localStore.getQuery(api.notifications.unreadCount, {});
      if (list === undefined) return;
      const now = Date.now();
      const samples = [
        {
          title: "Codebase sync failed — vvedantb/vmem",
          description: "Bad credentials — reconnect GitHub and sync again.",
          type: "error" as const,
        },
        {
          title: "Codebase sync stalled — vvedantb/vmem",
          description:
            "The sync was interrupted before finishing. Open the codebase and click Sync to retry.",
          type: "warning" as const,
        },
        {
          title: "Connector sync failed — Google Drive",
          description: "Token expired — reconnect the connector.",
          type: "error" as const,
        },
        {
          title: "Dream Mode finished",
          description:
            "3 proposals to review and 1 new memory. Open the Inbox to review.",
          type: "info" as const,
        },
      ];
      const optimistic = samples.map((sample, index) => ({
        _id: tempId<"notifications">(),
        _creationTime: now + index,
        userId: list[0]?.userId ?? tempId<"users">(),
        title: sample.title,
        description: sample.description,
        type: sample.type,
        read: false,
        createdAt: now + index,
      }));
      localStore.setQuery(api.notifications.listMy, {}, [
        ...optimistic,
        ...list,
      ]);
      if (unread !== undefined) {
        localStore.setQuery(
          api.notifications.unreadCount,
          {},
          unread + optimistic.length,
        );
      }
    },
  );
  return (
    <div className="flex items-center gap-2">
      {import.meta.env.DEV && (
        <Button
          variant="ghost"
          className="text-muted hover:text-foreground"
          onClick={() => {
            void sendTest({}).then(() =>
              toast.success("Sent one notification per producer"),
            );
          }}
        >
          Send test
        </Button>
      )}
      {unreadCount > 0 && (
        <Button
          variant="ghost"
          className="text-muted hover:text-foreground"
          onClick={markAllAsRead}
        >
          Mark all as read
        </Button>
      )}
    </div>
  );
}
