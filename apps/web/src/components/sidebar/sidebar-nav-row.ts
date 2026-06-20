import { cn } from "@vmem/ui";

/** Eva CollapsibleSidebarSection — muted-foreground/55 on vmem's text-muted token. */
export const sidebarSectionButtonClass =
  "flex w-full items-center gap-1.5 px-1 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted/55 transition-colors hover:text-muted/80";

export const sidebarSectionChevronClass =
  "shrink-0 text-muted/55 transition-transform duration-200";

/** Eva SharedLayoutNav.sidebarNavLinkClass text states. */
export function sidebarNavLinkTextClass(isActive: boolean): string {
  return cn(
    isActive
      ? "font-medium text-foreground"
      : "text-foreground/80 hover:text-foreground",
  );
}

/** Eva SharedLayoutNav spring — snappier slide between rows. */
export const sidebarSharedLayoutTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 38,
};

/** Eva-aligned padding for main sidebar nav rows (SharedLayoutNav.sidebarNavLinkClass). */
export function sidebarNavRowClass(isIconOnly: boolean): string {
  return cn(isIconOnly ? "justify-center px-0 py-1.5" : "gap-3 px-3 py-1.5");
}

/** Eva-aligned padding for denser sidebar list rows (skills, codebases). */
export const sidebarListRowClass = "gap-2 px-3 py-1.5";
