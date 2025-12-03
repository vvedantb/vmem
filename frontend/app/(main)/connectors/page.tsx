import {
  IconBrandGoogleDrive,
  IconBrandOnedrive,
  IconBrandDropbox,
  IconBrandNotion,
  IconBrandSlack,
  IconBrandGithub,
  IconCheck,
} from "@tabler/icons-react";

const connectors = [
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Connect your Google Drive to import documents and files",
    icon: IconBrandGoogleDrive,
    connected: true,
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Sync files from your Microsoft OneDrive account",
    icon: IconBrandOnedrive,
    connected: false,
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Import files and folders from Dropbox",
    icon: IconBrandDropbox,
    connected: false,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Sync pages and databases from your Notion workspace",
    icon: IconBrandNotion,
    connected: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Import messages and files from Slack channels",
    icon: IconBrandSlack,
    connected: false,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Connect repositories to index code and documentation",
    icon: IconBrandGithub,
    connected: true,
  },
];

export default function ConnectorsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
          Connectors
        </h2>
        <p className="text-neutral-500 mt-2">
          Connect external apps to import and sync your data
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connectors.map((connector) => {
          const Icon = connector.icon;
          return (
            <div
              key={connector.id}
              className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon
                    size={24}
                    stroke={1.5}
                    className="text-neutral-700 dark:text-neutral-300"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-black dark:text-white">
                      {connector.name}
                    </h3>
                    {connector.connected && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 text-neutral-600 dark:text-neutral-400">
                        <IconCheck size={12} stroke={2} />
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-500 mt-1">
                    {connector.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                {connector.connected ? (
                  <button className="px-4 py-2 rounded-xl border border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-400 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    Disconnect
                  </button>
                ) : (
                  <button className="px-4 py-2 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors">
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-6 rounded-xl border border-dashed border-black/20 dark:border-white/20 bg-black/[0.01] dark:bg-white/[0.01]">
        <div className="text-center">
          <p className="text-neutral-500">
            More connectors coming soon. Have a request?
          </p>
          <button className="mt-3 text-sm font-medium text-black dark:text-white hover:underline">
            Submit a request →
          </button>
        </div>
      </div>
    </div>
  );
}
