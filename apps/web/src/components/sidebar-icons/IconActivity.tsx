import { BaseIcon, type SidebarIconProps } from "./BaseIcon";

export function IconActivity(props: SidebarIconProps) {
  return (
    <BaseIcon {...props}>
      <path
        className="sb-activity-line"
        d="M3 12h4l2 -7l4 14l2 -7h6"
        pathLength={100}
      />
    </BaseIcon>
  );
}
