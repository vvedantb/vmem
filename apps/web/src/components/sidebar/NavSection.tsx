"use client";

import { useState, type ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { cn } from "@vmem/ui";

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
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-1.5 px-1 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted/55 transition-[color] hover:text-muted/80"
      >
        <span>{title}</span>
        <IconChevronDown
          size={12}
          aria-hidden
          className={cn(
            "shrink-0 text-muted/55 transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open ? <div className="space-y-1 pl-2">{children}</div> : null}
    </div>
  );
}
