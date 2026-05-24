import type { SidebarNavView } from "./SidebarNavigation";

const subSidebarTitles: Record<Exclude<SidebarNavView, "main">, string> = {
  settings: "Settings",
  skills: "Skills",
  wiki: "Wiki",
  teams: "Teams",
  codebases: "Codebases",
};

export function getSubSidebarTitle(navView: SidebarNavView): string | null {
  if (navView === "main") return null;
  return subSidebarTitles[navView];
}
