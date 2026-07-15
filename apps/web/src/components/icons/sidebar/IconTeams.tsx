import { BaseIcon, type SidebarIconProps } from "./BaseIcon";

export function IconTeams(props: SidebarIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 20V6.5a1.5 1.5 0 0 1 1.5 -1.5h13a1.5 1.5 0 0 1 1.5 1.5V20" />
      <path d="M3 20h18" />
      <path d="M10 20v-4a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v4" />
      <rect
        className="sb-team-w sb-team-w-1"
        x="7"
        y="8"
        width="3"
        height="3"
        rx="0.5"
        fill="currentColor"
        stroke="none"
      />
      <rect
        className="sb-team-w sb-team-w-2"
        x="14"
        y="8"
        width="3"
        height="3"
        rx="0.5"
        fill="currentColor"
        stroke="none"
      />
      <rect
        className="sb-team-w sb-team-w-3"
        x="7"
        y="12"
        width="3"
        height="2.5"
        rx="0.5"
        fill="currentColor"
        stroke="none"
      />
      <rect
        className="sb-team-w sb-team-w-4"
        x="14"
        y="12"
        width="3"
        height="2.5"
        rx="0.5"
        fill="currentColor"
        stroke="none"
      />
    </BaseIcon>
  );
}
