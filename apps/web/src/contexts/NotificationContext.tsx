import type { ReactNode } from "react";
import { createContext, use } from "react";
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
  const markAsReadMutation = useMutation(
    api.notifications.markAsRead,
  ).withOptimisticUpdate((localStore, args) => {
    const list = localStore.getQuery(api.notifications.listMy, {});
    const unread = localStore.getQuery(api.notifications.unreadCount, {});
    if (list === undefined) return;
    const target = list.find((n) => n._id === args.id);
    if (!target || target.read) {
      localStore.setQuery(
        api.notifications.listMy,
        {},
        list.map((n) => (n._id === args.id ? { ...n, read: true } : n)),
      );
      return;
    }
    localStore.setQuery(
      api.notifications.listMy,
      {},
      list.map((n) => (n._id === args.id ? { ...n, read: true } : n)),
    );
    if (unread !== undefined) {
      localStore.setQuery(
        api.notifications.unreadCount,
        {},
        Math.max(0, unread - 1),
      );
    }
  });
  const markAsUnreadMutation = useMutation(
    api.notifications.markAsUnread,
  ).withOptimisticUpdate((localStore, args) => {
    const list = localStore.getQuery(api.notifications.listMy, {});
    const unread = localStore.getQuery(api.notifications.unreadCount, {});
    if (list === undefined) return;
    const target = list.find((n) => n._id === args.id);
    if (!target || !target.read) {
      localStore.setQuery(
        api.notifications.listMy,
        {},
        list.map((n) => (n._id === args.id ? { ...n, read: false } : n)),
      );
      return;
    }
    localStore.setQuery(
      api.notifications.listMy,
      {},
      list.map((n) => (n._id === args.id ? { ...n, read: false } : n)),
    );
    if (unread !== undefined) {
      localStore.setQuery(api.notifications.unreadCount, {}, unread + 1);
    }
  });
  const markAllAsReadMutation = useMutation(
    api.notifications.markAllAsRead,
  ).withOptimisticUpdate((localStore) => {
    const list = localStore.getQuery(api.notifications.listMy, {});
    if (list !== undefined) {
      localStore.setQuery(
        api.notifications.listMy,
        {},
        list.map((n) => ({ ...n, read: true })),
      );
    }
    if (localStore.getQuery(api.notifications.unreadCount, {}) !== undefined) {
      localStore.setQuery(api.notifications.unreadCount, {}, 0);
    }
  });
  const deleteNotificationMutation = useMutation(
    api.notifications.deleteNotification,
  ).withOptimisticUpdate((localStore, args) => {
    const list = localStore.getQuery(api.notifications.listMy, {});
    const unread = localStore.getQuery(api.notifications.unreadCount, {});
    if (list === undefined) return;
    const target = list.find((n) => n._id === args.id);
    localStore.setQuery(
      api.notifications.listMy,
      {},
      list.filter((n) => n._id !== args.id),
    );
    if (target && !target.read && unread !== undefined) {
      localStore.setQuery(
        api.notifications.unreadCount,
        {},
        Math.max(0, unread - 1),
      );
    }
  });

  const isLoading =
    notifications === undefined || unreadCountResult === undefined;

  const markAsRead = (id: Id<"notifications">) => {
    void markAsReadMutation({ id });
  };

  const markAsUnread = (id: Id<"notifications">) => {
    void markAsUnreadMutation({ id });
  };

  const markAllAsRead = () => {
    void markAllAsReadMutation();
  };

  const deleteNotification = (id: Id<"notifications">) => {
    void deleteNotificationMutation({ id });
  };

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
  const context = use(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return context;
}
