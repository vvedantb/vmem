import { useState, type ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { Button, cn } from "@vmem/ui";
import {
  sidebarSectionButtonClass,
  sidebarSectionChevronClass,
} from "./sidebar-nav-row";

type NavSectionProps = {
  title: string;
  isIconOnly: boolean;
  children: ReactNode;
};

export function NavSection({ title, isIconOnly, children }: NavSectionProps) {
  const [open, setOpen] = useState(true);

  if (isIconOnly) {
    return <div className="space-y-1">{children}</div>;
  }

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          sidebarSectionButtonClass,
          "h-auto justify-start rounded-none active:scale-100",
          // ghost's text-muted/hover:text-foreground are utilities layer and
          // beat .sidebar-section-label's @layer components rule on
          // specificity ties — force the win with !important so the
          // dimmer color-mix tone from globals.css still applies.
          "![color:color-mix(in_oklch,var(--muted)_55%,transparent)]",
          "hover:!bg-transparent hover:![color:color-mix(in_oklch,var(--muted)_80%,transparent)]",
        )}
      >
        <span>{title}</span>
        <IconChevronDown
          size={12}
          aria-hidden
          className={cn(
            sidebarSectionChevronClass,
            "size-3",
            !open && "-rotate-90",
          )}
        />
      </Button>
      {open ? <div className="space-y-1 pl-2">{children}</div> : null}
    </div>
  );
}
