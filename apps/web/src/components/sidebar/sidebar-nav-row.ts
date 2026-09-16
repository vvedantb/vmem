import { cn } from "@vmem/ui";

// Eva SharedLayoutNav.sidebarSectionLabelClass — static section chrome,
// sentence case (no uppercase), padded to match nav rows so items sit flush.
export const sidebarSectionLabelClass =
  "sidebar-section-label px-3 py-1 text-[11px] font-medium tracking-[-0.01em]";

// inactive tabs use full muted active uses foreground
export function sidebarNavLinkTextClass(isActive: boolean): string {
  return cn(isActive ? "text-foreground" : "text-muted hover:text-foreground");
}

// shared layout pill slide between sidebar rows
export const sidebarSharedLayoutTransition = {
  type: "spring" as const,
  stiffness: 800,
  damping: 48,
};

// Eva-aligned padding for main sidebar nav rows (SharedLayoutNav.sidebarNavLinkClass)
export function sidebarNavRowClass(isIconOnly: boolean): string {
  return cn(isIconOnly ? "justify-center px-0 py-1.5" : "gap-3 px-3 py-1.5");
}

// Eva-aligned padding for denser sidebar list rows (skills, wiki)
export const sidebarListRowClass = "gap-2 px-3 py-1.5";
