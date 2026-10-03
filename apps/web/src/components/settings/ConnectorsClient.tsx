import { useState, type ReactNode } from "react";
import { Skeleton, Button } from "@vmem/ui";
import { IconPlug, IconPlus } from "@tabler/icons-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import ConnectorCard from "@/components/settings/ConnectorCard";
import BrowseConnectorsModal from "@/components/settings/BrowseConnectorsModal";
import { isConnectorConnected } from "@/components/settings/connector-utils";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/components/settings/SettingsEmptyState";

type Connector = FunctionReturnType<typeof api.connectors.crud.listMy>[number];

function BrowseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <IconPlus size={16} />
      Browse
      <span className="max-sm:sr-only"> Connectors</span>
    </Button>
  );
}

export function ConnectorsClient({
  connectors,
  tabs,
}: {
  connectors: Connector[] | undefined;
  /** Section tabs (Dashboard | Inbox | Sources, Connectors | Import). */
  tabs?: ReactNode;
}) {
  const [showBrowse, setShowBrowse] = useState(false);

  if (connectors === undefined) {
    return (
      <SettingsPage title="Sources" tabs={tabs}>
        <SettingsSection
          title="Connected"
          bodyClassName="grid gap-4 md:grid-cols-2"
        >
          {[1, 2].map((i) => (
            <div key={i} className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32 rounded" />
                <Skeleton className="h-4 w-full rounded" />
              </div>
            </div>
          ))}
        </SettingsSection>
      </SettingsPage>
    );
  }

  const connectedConnectors = connectors
    .filter((connector) => isConnectorConnected(connector))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <SettingsPage
        title="Sources"
        tabs={tabs}
        headerRight={<BrowseButton onClick={() => setShowBrowse(true)} />}
      >
        <SettingsSection
          title="Connected"
          description="Sync Google Drive, Notion, Gmail, Figma, or GitHub into your memories."
          bodyVariant={connectedConnectors.length === 0 ? "form" : undefined}
          bodyClassName={
            connectedConnectors.length === 0
              ? undefined
              : "grid grid-cols-1 gap-4 p-4 md:grid-cols-2"
          }
        >
          {connectedConnectors.length === 0 ? (
            <SettingsEmptyState
              icon={IconPlug}
              title="No connectors connected"
              description="Connect Google Drive, Notion, Gmail, Figma, or GitHub to sync content into your memories."
              action={<BrowseButton onClick={() => setShowBrowse(true)} />}
            />
          ) : (
            connectedConnectors.map((connector) => (
              <ConnectorCard key={connector._id} connector={connector} />
            ))
          )}
        </SettingsSection>
      </SettingsPage>

      <BrowseConnectorsModal
        isOpen={showBrowse}
        onClose={() => setShowBrowse(false)}
        connectors={connectors}
      />
    </>
  );
}
