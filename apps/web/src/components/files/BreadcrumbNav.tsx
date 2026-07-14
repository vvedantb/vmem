import { Breadcrumb, BreadcrumbLink, BreadcrumbPage, Button } from "@vmem/ui";
import type { Id } from "@vmem/backend";
import type { FolderBreadcrumb } from "./-types";

interface BreadcrumbNavProps {
  breadcrumbs: FolderBreadcrumb[];
  onNavigate: (folderId: Id<"fileNodes"> | null) => void;
}

// files page breadcrumb
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
            <Button
              type="button"
              variant="link"
              onClick={() => onNavigate(crumb.id)}
              className="h-auto p-0 font-normal text-inherit active:scale-[0.96]"
            >
              {crumb.name}
            </Button>
          </BreadcrumbLink>
        );
      })}
    </Breadcrumb>
  );
}
