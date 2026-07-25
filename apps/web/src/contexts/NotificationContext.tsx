import type { ReactNode } from "react";
import { createContext, use } from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
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

// shared by markAsRead/markAsUnread/deleteNotification's optimistic updates:
// each patches a notification within the cached list, then nudges the
// cached unread count by +/-1, clamped at 0 (a re-toggle or missing
// notification skips the count adjustment entirely by passing delta 0).
function patchReadFlag(
  list: Doc<"notifications">[],
  id: Id<"notifications">,
  read: boolean,
): Doc<"notifications">[] {
  return list.map((n) => (n._id === id ? { ...n, read } : n));
}

function adjustUnreadCount(
  localStore: OptimisticLocalStore,
  unread: number | undefined,
  delta: number,
): void {
  if (unread === undefined || delta === 0) return;
  localStore.setQuery(
    api.notifications.unreadCount,
    {},
    Math.max(0, unread + delta),
  );
}

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
    localStore.setQuery(
      api.notifications.listMy,
      {},
      patchReadFlag(list, args.id, true),
    );
    // already read (or missing) -> no count change
    adjustUnreadCount(localStore, unread, target && !target.read ? -1 : 0);
  });
  const markAsUnreadMutation = useMutation(
    api.notifications.markAsUnread,
  ).withOptimisticUpdate((localStore, args) => {
    const list = localStore.getQuery(api.notifications.listMy, {});
    const unread = localStore.getQuery(api.notifications.unreadCount, {});
    if (list === undefined) return;
    const target = list.find((n) => n._id === args.id);
    localStore.setQuery(
      api.notifications.listMy,
      {},
      patchReadFlag(list, args.id, false),
    );
    // already unread (or missing) -> no count change
    adjustUnreadCount(localStore, unread, target && target.read ? 1 : 0);
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
    adjustUnreadCount(localStore, unread, target && !target.read ? -1 : 0);
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
