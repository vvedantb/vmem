import type { ReactNode } from "react";
import { Button, cn } from "@vmem/ui";
import { IconX } from "@tabler/icons-react";

type SidebarHeaderProps = {
  title: string;
  isMobile: boolean;
  onClose: () => void;
  trailing?: ReactNode;
};

export function SidebarHeader({
  title,
  isMobile,
  onClose,
  trailing,
}: SidebarHeaderProps) {
  return (
    <div className="grid h-11 grid-cols-[2.5rem_1fr_2.5rem] items-center">
      <div />
      <h1 className="min-w-0 truncate text-center text-xl leading-none font-instrumentSerif text-foreground">
        {title}
      </h1>
      <div className="flex items-center justify-end gap-0.5">
        {trailing}
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
