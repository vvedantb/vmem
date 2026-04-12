import { IconChevronRight, IconHome } from "@tabler/icons-react";
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
  return (
    <nav className="flex items-center gap-1 text-sm min-w-0">
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const isRoot = index === 0;

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
                {isRoot ? (
                  <span className="flex items-center gap-1.5">
                    <IconHome size={14} stroke={1.5} />
                    Files
                  </span>
                ) : (
                  crumb.name
                )}
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate(crumb.id)}
              >
                {isRoot ? (
                  <span className="flex items-center gap-1.5">
                    <IconHome size={14} stroke={1.5} />
                    Files
                  </span>
                ) : (
                  crumb.name
                )}
              </Button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
