const stats = [
  { label: "Total Memories", value: "128" },
  { label: "This Week", value: "12" },
  { label: "Tags Used", value: "34" },
];

const recentMemories = [
  { title: "Project architecture notes", date: "2 hours ago" },
  { title: "Meeting with design team", date: "Yesterday" },
  { title: "API integration ideas", date: "3 days ago" },
];

const quickActions = [
  { label: "Add Memory", href: "/add-memory" },
  { label: "Search", href: "/memories" },
  { label: "API Keys", href: "/api-keys" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
          Dashboard
        </h2>
        <p className="text-neutral-500 mt-2">
          Welcome back to your memory vault
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="p-8 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
          >
            <p className="text-sm text-neutral-500 uppercase tracking-wider">
              {stat.label}
            </p>
            <p className="text-4xl font-semibold mt-3 text-black dark:text-white">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-8 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
          <h3 className="text-lg font-medium mb-6 text-black dark:text-white">
            Recent Memories
          </h3>
          <ul className="space-y-4">
            {recentMemories.map((memory, index) => (
              <li
                key={index}
                className="flex items-center justify-between py-3 border-b border-black/5 dark:border-white/5 last:border-0"
              >
                <span className="text-neutral-700 dark:text-neutral-300">
                  {memory.title}
                </span>
                <span className="text-sm text-neutral-400 dark:text-neutral-600">
                  {memory.date}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-8 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
          <h3 className="text-lg font-medium mb-6 text-black dark:text-white">
            Quick Actions
          </h3>
          <div className="space-y-3">
            {quickActions.map((action) => (
              <a
                key={action.href}
                href={action.href}
                className="block w-full px-5 py-4 rounded-xl border border-black/10 dark:border-white/10 text-left text-neutral-700 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-all"
              >
                {action.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
