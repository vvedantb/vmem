import { Button, cn } from "@vmem/ui";
import { IconX } from "@tabler/icons-react";

type SidebarHeaderProps = {
  title: string;
  isMobile: boolean;
  onClose: () => void;
  // `start` = title left, trailing right (skills/wiki plus). Default stays
  // Eva-centered for panels without a header action.
  titleAlign?: "center" | "start";
  trailingRef?: (node: HTMLDivElement | null) => void;
};

export function SidebarHeader({
  title,
  isMobile,
  onClose,
  titleAlign = "center",
  trailingRef,
}: SidebarHeaderProps) {
  const trailing = (
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
  );

  if (titleAlign === "start") {
    return (
      <div className="flex h-11 items-center gap-1 px-1">
        <h1 className="min-w-0 flex-1 truncate text-left text-xl leading-none font-instrumentSerif text-foreground">
          {title}
        </h1>
        {trailing}
      </div>
    );
  }

  return (
    <div className="grid h-11 grid-cols-[2.5rem_1fr_2.5rem] items-center">
      <div />
      <h1 className="min-w-0 truncate text-center text-xl leading-none font-instrumentSerif text-foreground">
        {title}
      </h1>
      {trailing}
    </div>
  );
}
