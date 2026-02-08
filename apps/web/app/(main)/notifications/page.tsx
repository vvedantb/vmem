"use client";

import { Button, Skeleton, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/react";
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
      return (
        <IconCheck
          className="w-5 h-5 text-green-600 dark:text-green-400"
          stroke={1.5}
        />
      );
    case "warning":
      return (
        <IconAlertTriangle
          className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
          stroke={1.5}
        />
      );
    case "error":
      return (
        <IconAlertCircle
          className="w-5 h-5 text-red-600 dark:text-red-400"
          stroke={1.5}
        />
      );
    case "info":
    default:
      return (
        <IconInfoCircle
          className="w-5 h-5 text-blue-600 dark:text-blue-400"
          stroke={1.5}
        />
      );
  }
}

function getIconBackground(type: NotificationType) {
  switch (type) {
    case "success":
      return "bg-green-100 dark:bg-green-900/30";
    case "warning":
      return "bg-yellow-100 dark:bg-yellow-900/30";
    case "error":
      return "bg-red-100 dark:bg-red-900/30";
    case "info":
    default:
      return "bg-blue-100 dark:bg-blue-900/30";
  }
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-6 rounded-xl border border-black/10 dark:border-white/10"
        >
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
      <div className="w-16 h-16 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4">
        <IconBellOff className="w-8 h-8 text-neutral-400" stroke={1.5} />
      </div>
      <h3 className="text-lg font-medium text-black dark:text-white mb-1">
        No notifications
      </h3>
      <p className="text-sm text-neutral-500">
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
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <IconAlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" stroke={1.5} />
          </div>
          <h3 className="text-lg font-medium text-black dark:text-white mb-1">
            Something went wrong
          </h3>
          <p className="text-sm text-neutral-500 mb-4">{error}</p>
          <Button
            variant="flat"
            onPress={fetchNotifications}
            className="bg-black/5 dark:bg-white/5"
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
            variant="light"
            className="text-neutral-500 hover:text-black dark:hover:text-white"
            onPress={markAllAsRead}
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
                  ? "border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]"
                  : "border-black/20 dark:border-white/20 bg-black/[0.04] dark:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${getIconBackground(
                    notification.type
                  )}`}
                >
                  <NotificationIcon type={notification.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <h3
                      className={`font-medium ${
                        notification.read
                          ? "text-neutral-600 dark:text-neutral-400"
                          : "text-black dark:text-white"
                      }`}
                    >
                      {notification.title}
                    </h3>
                    <span className="text-sm text-neutral-400 flex-shrink-0">
                      {notification.timestamp}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500 mt-1">
                    {notification.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!notification.read && (
                    <div className="w-2 h-2 rounded-full bg-black dark:bg-white flex-shrink-0" />
                  )}
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        isIconOnly
                        variant="light"
                        size="sm"
                        className="text-neutral-400 hover:text-black dark:hover:text-white"
                      >
                        <IconDotsVertical size={18} stroke={1.5} />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Notification actions"
                      onAction={(key) => {
                        if (key === "read") markAsRead(notification.id);
                        if (key === "unread") markAsUnread(notification.id);
                        if (key === "delete") deleteNotification(notification.id);
                      }}
                    >
                      {notification.read ? (
                        <DropdownItem
                          key="unread"
                          startContent={<IconEyeOff size={16} stroke={1.5} />}
                        >
                          Mark as unread
                        </DropdownItem>
                      ) : (
                        <DropdownItem
                          key="read"
                          startContent={<IconEye size={16} stroke={1.5} />}
                        >
                          Mark as read
                        </DropdownItem>
                      )}
                      <DropdownItem
                        key="delete"
                        className="text-danger"
                        color="danger"
                        startContent={<IconTrash size={16} stroke={1.5} />}
                      >
                        Delete
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
