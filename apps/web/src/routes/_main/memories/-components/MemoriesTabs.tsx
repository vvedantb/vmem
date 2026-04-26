import { Link, useMatchRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import { IconTopologyStar3, IconList, IconHash } from "@tabler/icons-react";

/**
 * Shared tab bar for the memories surface.
 *
 * Three destinations live behind this control:
 * - Graph → /memories?view=graph (default)
 * - List  → /memories?view=list
 * - Tags  → /memories/tags (separate route)
 *
 * Active state is derived from the current route + `view` param so the
 * same component renders correctly on both `/memories` and `/memories/tags`.
 * Tabs are wired as `<Link>`s rather than controlled `<TabsTrigger>`s to
 * keep navigation a single source of truth (the URL).
 */
export function MemoriesTabs({
  currentView,
}: {
  currentView: "graph" | "list";
}) {
  const matchRoute = useMatchRoute();
  const isOnTags = Boolean(matchRoute({ to: "/memories/tags" }));
  const activeValue = isOnTags ? "tags" : currentView;

  return (
    <Tabs value={activeValue}>
      <TabsList>
        <TabsTrigger value="graph" asChild>
          <Link to="/memories" search={(prev) => ({ ...prev, view: "graph" })}>
            <IconTopologyStar3 size={16} className="mr-1.5" />
            Graph
          </Link>
        </TabsTrigger>
        <TabsTrigger value="list" asChild>
          <Link to="/memories" search={(prev) => ({ ...prev, view: "list" })}>
            <IconList size={16} className="mr-1.5" />
            List
          </Link>
        </TabsTrigger>
        <TabsTrigger value="tags" asChild>
          <Link to="/memories/tags">
            <IconHash size={16} className="mr-1.5" />
            Tags
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
