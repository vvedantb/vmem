import { Breadcrumb, BreadcrumbLink, BreadcrumbPage } from "@vmem/ui";
import type { FolderBreadcrumb } from "@/lib/file-types";

interface BreadcrumbNavProps {
  breadcrumbs: FolderBreadcrumb[];
  onNavigate: (folderId: string | null) => void;
}

/**
 * Files page breadcrumb. Renders the folder path using the generic @vmem/ui
 * Breadcrumb primitive so the styling matches other detail pages.
 *
 * Navigation is a nuqs state update (not a router Link), so parent segments
 * render as buttons inside BreadcrumbLink's asChild slot. The final segment
 * is the current folder (or "Files" at root) and is not clickable.
 */
export default function BreadcrumbNav({
  breadcrumbs,
  onNavigate,
}: BreadcrumbNavProps) {
  return (
    <Breadcrumb>
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const key = crumb.id ?? "root";

        if (isLast) {
          return <BreadcrumbPage key={key}>{crumb.name}</BreadcrumbPage>;
        }

        return (
          <BreadcrumbLink key={key} asChild>
            <button
              type="button"
              onClick={() => onNavigate(crumb.id)}
              className="transition-transform active:scale-[0.96]"
            >
              {crumb.name}
            </button>
          </BreadcrumbLink>
        );
      })}
    </Breadcrumb>
  );
}
