const mockNotifications = [
  {
    id: "1",
    title: "Memory limit approaching",
    description: "You've used 80% of your memory storage quota.",
    type: "warning",
    read: false,
    timestamp: "2 hours ago",
  },
  {
    id: "2",
    title: "New API key created",
    description: "A new API key 'Production App' was created successfully.",
    type: "success",
    read: false,
    timestamp: "Yesterday",
  },
  {
    id: "3",
    title: "Weekly summary ready",
    description: "Your weekly memory activity report is now available.",
    type: "info",
    read: true,
    timestamp: "3 days ago",
  },
  {
    id: "4",
    title: "Security alert",
    description: "Unusual API activity detected from a new IP address.",
    type: "error",
    read: true,
    timestamp: "1 week ago",
  },
];

export default function NotificationsPage() {
  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
            Notifications
          </h2>
          <p className="text-neutral-500 mt-2">
            Stay updated on your account activity
          </p>
        </div>
        <button className="px-4 py-2 text-sm text-neutral-500 hover:text-black dark:hover:text-white transition-colors">
          Mark all as read
        </button>
      </div>

      <div className="space-y-3">
        {mockNotifications.map((notification) => (
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
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  notification.type === "success"
                    ? "bg-green-100 dark:bg-green-900/30"
                    : notification.type === "warning"
                      ? "bg-yellow-100 dark:bg-yellow-900/30"
                      : notification.type === "error"
                        ? "bg-red-100 dark:bg-red-900/30"
                        : "bg-blue-100 dark:bg-blue-900/30"
                }`}
              >
                {notification.type === "success" && (
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {notification.type === "warning" && (
                  <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
                {notification.type === "error" && (
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {notification.type === "info" && (
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <h3 className={`font-medium ${notification.read ? "text-neutral-600 dark:text-neutral-400" : "text-black dark:text-white"}`}>
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
              {!notification.read && (
                <div className="w-2 h-2 rounded-full bg-black dark:bg-white flex-shrink-0 mt-2" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

