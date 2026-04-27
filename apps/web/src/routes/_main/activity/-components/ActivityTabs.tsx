import { Link, useMatchRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import { IconReceipt2, IconActivity } from "@tabler/icons-react";
import { AnimatedTabLabel } from "@/components/AnimatedTabLabel";

/**
 * Tab bar for the `/activity` page header.
 *
 * Each tab is a real subroute (`/activity/ai-logs`, `/activity/events`)
 * so the tabs are wired as `<Link>`s — navigation is a single source of
 * truth (the URL), and active state is derived from `useMatchRoute`.
 *
 * - AI Logs → backend LLM / embedding calls vmem fires on the user's behalf
 * - Events  → user-action audit log (memory created, file uploaded, etc.)
 */
export function ActivityTabs() {
  const matchRoute = useMatchRoute();
  const isEvents = Boolean(matchRoute({ to: "/activity/events" }));
  const activeValue = isEvents ? "events" : "ai-logs";

  return (
    <Tabs value={activeValue}>
      <TabsList>
        <TabsTrigger value="ai-logs" asChild>
          <Link to="/activity/ai-logs">
            <IconReceipt2 size={16} />
            <AnimatedTabLabel
              isActive={activeValue === "ai-logs"}
              label="AI Logs"
            />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="events" asChild>
          <Link to="/activity/events">
            <IconActivity size={16} />
            <AnimatedTabLabel
              isActive={activeValue === "events"}
              label="Events"
            />
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
