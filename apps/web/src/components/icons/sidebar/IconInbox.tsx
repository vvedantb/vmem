import { BaseIcon, type SidebarIconProps } from "./BaseIcon";

export function IconInbox(props: SidebarIconProps) {
  return (
    <BaseIcon {...props}>
      <rect
        className="sb-inbox-letter"
        x="9"
        y="8"
        width="6"
        height="4"
        rx="0.5"
        fill="currentColor"
        stroke="none"
      />
      <path d="M4 13l2 -8a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1l2 8" />
      <path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1 -1v-6" />
      <path d="M4 13h4l1 2h6l1 -2h4" />
    </BaseIcon>
  );
}
