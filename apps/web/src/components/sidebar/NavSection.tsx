"use client";

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
        className={cn(sidebarSectionButtonClass, "h-auto justify-start")}
      >
        <span>{title}</span>
        <IconChevronDown
          size={12}
          aria-hidden
          className={cn(sidebarSectionChevronClass, !open && "-rotate-90")}
        />
      </Button>
      {open ? <div className="space-y-1 pl-2">{children}</div> : null}
    </div>
  );
}
