import { BaseIcon, type SidebarIconProps } from "./BaseIcon";

export function IconCodebases(props: SidebarIconProps) {
  return (
    <BaseIcon {...props}>
      <ellipse className="sb-db-top" cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8 -1.34 8 -3v-14" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8 -1.34 8 -3" />
    </BaseIcon>
  );
}
