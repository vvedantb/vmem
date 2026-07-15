import { BaseIcon, type SidebarIconProps } from "./BaseIcon";

export function IconSkills(props: SidebarIconProps) {
  return (
    <BaseIcon {...props}>
      <path className="sb-bolt" d="M13 3L4 14h7l-1 7l9 -11h-7l1 -7z" />
    </BaseIcon>
  );
}
