import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import { IconChecklist, IconBell, IconActivity } from "@tabler/icons-react";
import type { InboxTab } from "../-searchParams";

/**
 * Tab bar for the Inbox header. Lives in `PageContainer.leftSection`.
 * Drives the `?tab=` URL param via the orchestrator's setter.
 */
export function InboxTabs({
  value,
  onChange,
}: {
  value: InboxTab;
  onChange: (tab: InboxTab) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as InboxTab)}>
      <TabsList>
        <TabsTrigger value="proposals">
          <IconChecklist size={16} className="mr-1.5" />
          Proposals
        </TabsTrigger>
        <TabsTrigger value="notifications">
          <IconBell size={16} className="mr-1.5" />
          Notifications
        </TabsTrigger>
        <TabsTrigger value="activity">
          <IconActivity size={16} className="mr-1.5" />
          Activity
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
