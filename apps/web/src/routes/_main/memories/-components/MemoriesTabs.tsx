import { Link, useMatchRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, AnimatedTabLabel } from "@vmem/ui";
import { IconTopologyStar3, IconList, IconHash } from "@tabler/icons-react";

/**
 * Shared tab bar for the memories surface.
 *
 * Each tab is a real subroute now — Graph (`/memories/graph`), List
 * (`/memories/list`), Tags (`/memories/tags`) — so active state is
 * derived purely from the URL via `useMatchRoute`. Tabs are wired as
 * `<Link>`s so navigation is a single source of truth and browser
 * back/forward Just Works.
 */
export function MemoriesTabs() {
  const matchRoute = useMatchRoute();
  const isGraph = Boolean(matchRoute({ to: "/memories/graph" }));
  const isList = Boolean(matchRoute({ to: "/memories/list" }));
  const isTags = Boolean(matchRoute({ to: "/memories/tags" }));
  const activeValue = isTags
    ? "tags"
    : isList
      ? "list"
      : isGraph
        ? "graph"
        : "";

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
        <TabsTrigger value="tags" asChild>
          <Link to="/memories/tags">
            <IconHash size={16} />
            <AnimatedTabLabel isActive={activeValue === "tags"} label="Tags" />
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
