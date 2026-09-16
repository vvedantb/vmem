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

// Eva RepoRail tiles — size-11, rounded-lg, press scale on the rail
export const RAIL_TILE_CLASS =
  "relative flex size-11 items-center justify-center rounded-lg border active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

const railTileActiveClass =
  "border-transparent bg-surface-tertiary text-foreground";

export function railTileStateClass(active: boolean): string {
  return active
    ? railTileActiveClass
    : "border-transparent text-muted opacity-75 hover:bg-surface-tertiary/50 hover:opacity-100 hover:text-foreground";
}

export const RAIL_BADGE_CLASS =
  "absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground";
