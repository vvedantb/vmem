"use client";

import { Button, Card, CardBody, Chip } from "@heroui/react";
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
            <Card
              key={connector.id}
              classNames={{
                base: "border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none",
              }}
            >
              <CardBody className="p-6">
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
                        <Chip
                          size="sm"
                          variant="flat"
                          startContent={<IconCheck size={12} stroke={2} />}
                          classNames={{
                            base: "bg-black/5 dark:bg-white/10",
                            content:
                              "text-neutral-600 dark:text-neutral-400 text-xs font-medium",
                          }}
                        >
                          Connected
                        </Chip>
                      )}
                    </div>
                    <p className="text-sm text-neutral-500 mt-1">
                      {connector.description}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  {connector.connected ? (
                    <Button
                      variant="bordered"
                      size="sm"
                      className="border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-400"
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-black dark:bg-white text-white dark:text-black font-medium"
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card
        classNames={{
          base: "border border-dashed border-black/20 dark:border-white/20 bg-black/[0.01] dark:bg-white/[0.01] shadow-none",
        }}
      >
        <CardBody className="p-6 text-center">
          <p className="text-neutral-500">
            More connectors coming soon. Have a request?
          </p>
          <Button variant="light" size="sm" className="mt-3 font-medium">
            Submit a request →
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
