const mockLogs = [
  {
    id: "1",
    endpoint: "POST /api/memories",
    status: 201,
    duration: "124ms",
    timestamp: "2 minutes ago",
  },
  {
    id: "2",
    endpoint: "GET /api/memories",
    status: 200,
    duration: "45ms",
    timestamp: "15 minutes ago",
  },
  {
    id: "3",
    endpoint: "POST /api/chat",
    status: 200,
    duration: "892ms",
    timestamp: "1 hour ago",
  },
  {
    id: "4",
    endpoint: "DELETE /api/memories/123",
    status: 404,
    duration: "12ms",
    timestamp: "2 hours ago",
  },
  {
    id: "5",
    endpoint: "GET /api/memories/search",
    status: 200,
    duration: "234ms",
    timestamp: "3 hours ago",
  },
];

export default function ApiLogsPage() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
          <p className="text-sm text-neutral-500 uppercase tracking-wider">
            Total Requests
          </p>
          <p className="text-3xl font-semibold mt-2 text-black dark:text-white">
            1,284
          </p>
        </div>
        <div className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
          <p className="text-sm text-neutral-500 uppercase tracking-wider">
            Success Rate
          </p>
          <p className="text-3xl font-semibold mt-2 text-green-600 dark:text-green-400">
            99.2%
          </p>
        </div>
        <div className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
          <p className="text-sm text-neutral-500 uppercase tracking-wider">
            Avg Response
          </p>
          <p className="text-3xl font-semibold mt-2 text-black dark:text-white">
            156ms
          </p>
        </div>
      </div>

      <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                Endpoint
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                Duration
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {mockLogs.map((log) => (
              <tr
                key={log.id}
                className="border-b border-black/5 dark:border-white/5 last:border-0"
              >
                <td className="px-6 py-5">
                  <code className="text-sm text-neutral-800 dark:text-neutral-200 font-mono">
                    {log.endpoint}
                  </code>
                </td>
                <td className="px-6 py-5">
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${
                      log.status >= 200 && log.status < 300
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : log.status >= 400
                          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                    }`}
                  >
                    {log.status}
                  </span>
                </td>
                <td className="px-6 py-5 hidden md:table-cell">
                  <span className="text-sm text-neutral-500">{log.duration}</span>
                </td>
                <td className="px-6 py-5">
                  <span className="text-sm text-neutral-500">
                    {log.timestamp}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

