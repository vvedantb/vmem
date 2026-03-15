"use client";

import { createContext, useContext, useCallback, ReactNode } from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";

export type NotificationType = "success" | "warning" | "error" | "info";

interface NotificationContextType {
  notifications: Doc<"notifications">[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: Id<"notifications">) => void;
  markAsUnread: (id: Id<"notifications">) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: Id<"notifications">) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const notifications = useQuery(
    api.notifications.listMy,
    isAuthenticated ? {} : "skip",
  );
  const unreadCountResult = useQuery(
    api.notifications.unreadCount,
    isAuthenticated ? {} : "skip",
  );
  const markAsReadMutation = useMutation(api.notifications.markAsRead);
  const markAsUnreadMutation = useMutation(api.notifications.markAsUnread);
  const markAllAsReadMutation = useMutation(api.notifications.markAllAsRead);
  const deleteNotificationMutation = useMutation(
    api.notifications.deleteNotification,
  );

  const isLoading =
    notifications === undefined || unreadCountResult === undefined;

  const markAsRead = useCallback(
    (id: Id<"notifications">) => {
      void markAsReadMutation({ id });
    },
    [markAsReadMutation],
  );

  const markAsUnread = useCallback(
    (id: Id<"notifications">) => {
      void markAsUnreadMutation({ id });
    },
    [markAsUnreadMutation],
  );

  const markAllAsRead = useCallback(() => {
    void markAllAsReadMutation();
  }, [markAllAsReadMutation]);

  const deleteNotification = useCallback(
    (id: Id<"notifications">) => {
      void deleteNotificationMutation({ id });
    },
    [deleteNotificationMutation],
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications: notifications ?? [],
        unreadCount: unreadCountResult ?? 0,
        isLoading,
        markAsRead,
        markAsUnread,
        markAllAsRead,
        deleteNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return context;
}
