import { cn } from "@vmem/ui";

/** Eva-aligned padding for main sidebar nav rows (SharedLayoutNav.sidebarNavLinkClass). */
export function sidebarNavRowClass(isIconOnly: boolean): string {
  return cn(isIconOnly ? "justify-center px-0 py-1.5" : "gap-3 px-3 py-1.5");
}

/** Eva-aligned padding for denser sidebar list rows (skills, codebases). */
export const sidebarListRowClass = "gap-2 px-3 py-1.5";
