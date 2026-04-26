import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import { IconKey, IconChartBar } from "@tabler/icons-react";
import type { ApiTab } from "../-searchParams";

/**
 * Tab bar for the merged `/settings/api` page header.
 *
 * - Keys → manage credentials (third parties use these)
 * - Usage → see analytics on what those credentials called
 */
export function ApiTabs({
  value,
  onChange,
}: {
  value: ApiTab;
  onChange: (tab: ApiTab) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as ApiTab)}>
      <TabsList>
        <TabsTrigger value="keys">
          <IconKey size={16} className="mr-1.5" />
          Keys
        </TabsTrigger>
        <TabsTrigger value="usage">
          <IconChartBar size={16} className="mr-1.5" />
          Usage
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
