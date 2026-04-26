import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import { IconReceipt2, IconActivity } from "@tabler/icons-react";
import type { ActivityTab } from "../-searchParams";

/**
 * Tab bar for the `/activity` page header.
 *
 * - AI Logs → backend LLM / embedding calls vmem fires on the user's behalf
 * - Events → user-action audit log (memory created, file uploaded, etc.)
 *
 * Both are passive logs — they live together because neither requires
 * action, just visibility.
 */
export function ActivityTabs({
  value,
  onChange,
}: {
  value: ActivityTab;
  onChange: (tab: ActivityTab) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as ActivityTab)}>
      <TabsList>
        <TabsTrigger value="ai-logs">
          <IconReceipt2 size={16} className="mr-1.5" />
          AI Logs
        </TabsTrigger>
        <TabsTrigger value="events">
          <IconActivity size={16} className="mr-1.5" />
          Events
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
