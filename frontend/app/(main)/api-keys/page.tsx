const mockApiKeys = [
  {
    id: "1",
    name: "Production App",
    key: "vmem_sk_**********************a3f2",
    createdAt: "Nov 15, 2025",
    lastUsed: "2 hours ago",
  },
  {
    id: "2",
    name: "Development",
    key: "vmem_sk_**********************b7c1",
    createdAt: "Oct 28, 2025",
    lastUsed: "Yesterday",
  },
];

export default function ApiKeysPage() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
          API Keys
        </h2>
        <p className="text-neutral-500 mt-2">
          Manage your API keys for programmatic access
        </p>
      </div>

      <div className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-black dark:text-white">
              MCP Integration
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              Use your API key to connect vMemory with MCP-compatible clients.
              Your memories will be accessible through the Model Context
              Protocol.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-black dark:text-white">
          Your API Keys
        </h3>
        <button className="px-5 py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors">
          Create New Key
        </button>
      </div>

      <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                Name
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider hidden md:table-cell">
                Key
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                Last Used
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-neutral-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {mockApiKeys.map((apiKey) => (
              <tr
                key={apiKey.id}
                className="border-b border-black/5 dark:border-white/5 last:border-0"
              >
                <td className="px-6 py-5">
                  <span className="text-neutral-800 dark:text-neutral-200">
                    {apiKey.name}
                  </span>
                </td>
                <td className="px-6 py-5 hidden md:table-cell">
                  <code className="text-sm text-neutral-500 font-mono">
                    {apiKey.key}
                  </code>
                </td>
                <td className="px-6 py-5">
                  <span className="text-sm text-neutral-500">
                    {apiKey.lastUsed}
                  </span>
                </td>
                <td className="px-6 py-5">
                  <button className="text-sm text-neutral-500 hover:text-black dark:hover:text-white transition-colors">
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
