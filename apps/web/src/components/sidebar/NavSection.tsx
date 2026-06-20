"use client";

import { useState, type ReactNode } from "react";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@vmem/ui";

type NavSectionProps = {
  title: string;
  isIconOnly: boolean;
  children: ReactNode;
};

export function NavSection({ title, isIconOnly, children }: NavSectionProps) {
  const [open, setOpen] = useState(true);

  if (isIconOnly) {
    return <div className="mb-4 px-1">{children}</div>;
  }

  return (
    <div className="mb-4 px-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="mb-2 flex w-full items-center gap-1 rounded-lg px-3.5 py-1 text-left transition-[color] hover:text-muted"
      >
        <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted/45">
          {title}
        </span>
        <IconChevronRight
          size={14}
          stroke={2}
          aria-hidden
          className={cn(
            "shrink-0 text-muted/45 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? children : null}
    </div>
  );
}
