export type TeamSectionId = "overview" | "knowledge" | "members" | "settings";

type TeamSectionTo =
  | "/teams/$teamId/overview"
  | "/teams/$teamId/knowledge"
  | "/teams/$teamId/members"
  | "/teams/$teamId/settings";

export interface TeamSectionLink {
  id: TeamSectionId;
  label: string;
  to: TeamSectionTo;
}

export function getTeamSections(isOwner: boolean): TeamSectionLink[] {
  const sections: TeamSectionLink[] = [
    { id: "overview", label: "Overview", to: "/teams/$teamId/overview" },
    { id: "knowledge", label: "Knowledge", to: "/teams/$teamId/knowledge" },
    { id: "members", label: "Members", to: "/teams/$teamId/members" },
  ];
  if (isOwner) {
    sections.push({
      id: "settings",
      label: "Settings",
      to: "/teams/$teamId/settings",
    });
  }
  return sections;
}

const teamSectionLabels: Record<TeamSectionId, string> = {
  overview: "Overview",
  knowledge: "Knowledge",
  members: "Members",
  settings: "Settings",
};

export function getTeamSectionLabel(sectionId: TeamSectionId): string {
  return teamSectionLabels[sectionId];
}
