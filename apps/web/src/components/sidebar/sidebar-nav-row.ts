import { cn } from "@vmem/ui";

// section headers — dimmer than full text-muted tabs (see .sidebar-section-label)
export const sidebarSectionButtonClass =
  "sidebar-section-label flex w-full items-center gap-1.5 px-1 py-1 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors";

export const sidebarSectionChevronClass =
  "shrink-0 text-current transition-transform duration-200";

// inactive tabs use full muted; active uses foreground
export function sidebarNavLinkTextClass(isActive: boolean): string {
  return cn(isActive ? "text-foreground" : "text-muted hover:text-foreground");
}

// eva SharedLayoutNav spring — snappier slide between rows
export const sidebarSharedLayoutTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 38,
};

// eva-aligned padding for main sidebar nav rows (SharedLayoutNav.sidebarNavLinkClass)
export function sidebarNavRowClass(isIconOnly: boolean): string {
  return cn(isIconOnly ? "justify-center px-0 py-1.5" : "gap-3 px-3 py-1.5");
}

// eva-aligned padding for denser sidebar list rows (skills, codebases)
export const sidebarListRowClass = "gap-2 px-3 py-1.5";
