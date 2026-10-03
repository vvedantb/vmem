import { Button, cn } from "@vmem/ui";
import { IconX } from "@tabler/icons-react";

type SidebarHeaderProps = {
  title: string;
  isMobile: boolean;
  onClose: () => void;
  trailingRef?: (node: HTMLDivElement | null) => void;
};

// Title left, trailing actions (feature plus, mobile close) right.
export function SidebarHeader({
  title,
  isMobile,
  onClose,
  trailingRef,
}: SidebarHeaderProps) {
  return (
    <div className="flex h-11 items-center gap-1 pl-3 pr-1">
      <h1 className="min-w-0 flex-1 truncate text-left text-base font-semibold leading-none tracking-tight text-foreground">
        {title}
      </h1>
      <div className="flex items-center justify-end gap-0.5">
        <div ref={trailingRef} className="flex items-center" />
        {isMobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close navigation"
            className={cn(
              "rounded-lg text-muted transition-colors hover:bg-surface-tertiary/50 hover:text-foreground",
            )}
          >
            <IconX className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
