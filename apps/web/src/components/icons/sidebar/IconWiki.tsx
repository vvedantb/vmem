import { BaseIcon, type SidebarIconProps } from "./BaseIcon";

export function IconWiki(props: SidebarIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1z" />
      <path d="M8 4v16" />
      <path
        className="sb-wiki-line sb-wiki-line-1"
        d="M11 8h6"
        pathLength={100}
      />
      <path
        className="sb-wiki-line sb-wiki-line-2"
        d="M11 12h6"
        pathLength={100}
      />
      <path
        className="sb-wiki-line sb-wiki-line-3"
        d="M11 16h4"
        pathLength={100}
      />
    </BaseIcon>
  );
}
