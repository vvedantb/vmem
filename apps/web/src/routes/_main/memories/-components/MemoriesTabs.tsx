import { Link, useMatchRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, AnimatedTabLabel } from "@vmem/ui";
import { IconTopologyStar3, IconList } from "@tabler/icons-react";

/**
 * Shared tab bar for the memories surface.
 *
 * Two routes today: Graph (`/memories/graph`) and List (`/memories/list`).
 * The previous Tags tab folded into the list route as `?view=tags` — both
 * forms (memory rows and tag rows) share the same header chrome and switch
 * via the View dropdown in `MemoryListHeaderControls`.
 *
 * Active state is derived from the URL via `useMatchRoute`; tabs are wired
 * as `<Link>`s so navigation is the single source of truth and browser
 * back/forward Just Works.
 */
export function MemoriesTabs() {
  const matchRoute = useMatchRoute();
  const isGraph = Boolean(matchRoute({ to: "/memories/graph" }));
  const isList = Boolean(matchRoute({ to: "/memories/list" }));
  const activeValue = isList ? "list" : isGraph ? "graph" : "";

  return (
    <Tabs value={activeValue}>
      <TabsList>
        <TabsTrigger value="graph" asChild>
          <Link to="/memories/graph">
            <IconTopologyStar3 size={16} />
            <AnimatedTabLabel
              isActive={activeValue === "graph"}
              label="Graph"
            />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="list" asChild>
          <Link to="/memories/list">
            <IconList size={16} />
            <AnimatedTabLabel isActive={activeValue === "list"} label="List" />
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
