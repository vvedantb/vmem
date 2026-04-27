import { Link, useMatchRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
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
            <IconChecklist
              size={16}
              className={activeValue === "proposals" ? "mr-1.5" : ""}
            />
            {activeValue === "proposals" && "Proposals"}
          </Link>
        </TabsTrigger>
        <TabsTrigger value="notifications" asChild>
          <Link to="/inbox/notifications">
            <IconBell
              size={16}
              className={activeValue === "notifications" ? "mr-1.5" : ""}
            />
            {activeValue === "notifications" && "Notifications"}
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
