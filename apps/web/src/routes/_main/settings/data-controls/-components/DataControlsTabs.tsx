import { Link, useMatchRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, AnimatedTabLabel } from "@vmem/ui";
import {
  IconFileImport,
  IconFileExport,
  IconShieldLock,
} from "@tabler/icons-react";

/**
 * Tab bar for the `/settings/data-controls` page header. Each tab is a
 * real subroute so the tabs are wired as `<Link>`s; active state comes
 * from `useMatchRoute`.
 *
 * - Import → bring memories in from external services
 * - Export → take memories out (placeholder)
 * - Data Control → destructive operations (wipe-all)
 */
export function DataControlsTabs() {
  const matchRoute = useMatchRoute();
  const isExport = Boolean(
    matchRoute({ to: "/settings/data-controls/export" }),
  );
  const isDanger = Boolean(
    matchRoute({ to: "/settings/data-controls/danger" }),
  );
  const activeValue = isExport ? "export" : isDanger ? "danger" : "import";

  return (
    <Tabs value={activeValue}>
      <TabsList>
        <TabsTrigger value="import" asChild>
          <Link to="/settings/data-controls/import">
            <IconFileImport size={16} />
            <AnimatedTabLabel
              isActive={activeValue === "import"}
              label="Import"
            />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="export" asChild>
          <Link to="/settings/data-controls/export">
            <IconFileExport size={16} />
            <AnimatedTabLabel
              isActive={activeValue === "export"}
              label="Export"
            />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="danger" asChild>
          <Link to="/settings/data-controls/danger">
            <IconShieldLock size={16} />
            <AnimatedTabLabel
              isActive={activeValue === "danger"}
              label="Data Control"
            />
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
