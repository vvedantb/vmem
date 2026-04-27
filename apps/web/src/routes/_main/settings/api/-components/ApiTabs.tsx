import { Link, useMatchRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import { IconKey, IconChartBar } from "@tabler/icons-react";
import { AnimatedTabLabel } from "@/components/AnimatedTabLabel";

/**
 * Tab bar for the `/settings/api` page header. Each tab is a real
 * subroute so the tabs are wired as `<Link>`s; active state comes from
 * `useMatchRoute`.
 *
 * - Keys  → manage credentials (third parties use these)
 * - Usage → see analytics on what those credentials called
 */
export function ApiTabs() {
  const matchRoute = useMatchRoute();
  const isUsage = Boolean(matchRoute({ to: "/settings/api/usage" }));
  const activeValue = isUsage ? "usage" : "keys";

  return (
    <Tabs value={activeValue}>
      <TabsList>
        <TabsTrigger value="keys" asChild>
          <Link to="/settings/api/keys">
            <IconKey size={16} />
            <AnimatedTabLabel isActive={activeValue === "keys"} label="Keys" />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="usage" asChild>
          <Link to="/settings/api/usage">
            <IconChartBar size={16} />
            <AnimatedTabLabel
              isActive={activeValue === "usage"}
              label="Usage"
            />
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
