import { Link, useMatchRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, AnimatedTabLabel } from "@vmem/ui";
import { IconChecklist, IconBell } from "@tabler/icons-react";

/**
 * Tab bar for the `/inbox` page header. Each tab is a real subroute so
 * the tabs are wired as `<Link>`s; active state comes from `useMatchRoute`.
 */
export function InboxTabs() {
  const matchRoute = useMatchRoute();
  const isNotifications = Boolean(matchRoute({ to: "/inbox/notifications" }));
  const activeValue = isNotifications ? "notifications" : "proposals";

  return (
    <Tabs value={activeValue}>
      <TabsList>
        <TabsTrigger value="proposals" asChild>
          <Link to="/inbox/proposals">
            <IconChecklist size={16} />
            <AnimatedTabLabel
              isActive={activeValue === "proposals"}
              label="Proposals"
            />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="notifications" asChild>
          <Link to="/inbox/notifications">
            <IconBell size={16} />
            <AnimatedTabLabel
              isActive={activeValue === "notifications"}
              label="Notifications"
            />
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
