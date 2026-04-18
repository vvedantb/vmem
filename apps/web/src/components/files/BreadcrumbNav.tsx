import { IconChevronRight } from "@tabler/icons-react";
import { Button } from "@vmem/ui";
import type { FolderBreadcrumb } from "@/lib/file-types";

interface BreadcrumbNavProps {
  breadcrumbs: FolderBreadcrumb[];
  onNavigate: (folderId: string | null) => void;
}

export default function BreadcrumbNav({
  breadcrumbs,
  onNavigate,
}: BreadcrumbNavProps) {
  // Skip the root "Files" crumb, only show folder hierarchy
  const folderCrumbs = breadcrumbs.slice(1);

  if (folderCrumbs.length === 0) {
    return null;
  }

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0">
      {folderCrumbs.map((crumb, index) => {
        const isLast = index === folderCrumbs.length - 1;

        return (
          <div
            key={crumb.id ?? "root"}
            className="flex items-center gap-1 min-w-0"
          >
            {index > 0 && (
              <IconChevronRight
                size={14}
                className="text-muted-foreground/50 flex-shrink-0"
              />
            )}
            {isLast ? (
              <span className="text-foreground font-medium truncate">
                {crumb.name}
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate(crumb.id)}
              >
                {crumb.name}
              </Button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
