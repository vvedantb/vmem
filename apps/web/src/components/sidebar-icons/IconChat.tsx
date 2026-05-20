import { BaseIcon, type SidebarIconProps } from "./BaseIcon";

export function IconChat(props: SidebarIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 20l1.3 -3.9a9 9 0 1 1 3.4 2.9l-4.7 1" />
      <circle
        className="sb-chat-dot sb-chat-dot-1"
        cx="8"
        cy="11"
        r="1.1"
        fill="currentColor"
        stroke="none"
      />
      <circle
        className="sb-chat-dot sb-chat-dot-2"
        cx="12"
        cy="11"
        r="1.1"
        fill="currentColor"
        stroke="none"
      />
      <circle
        className="sb-chat-dot sb-chat-dot-3"
        cx="16"
        cy="11"
        r="1.1"
        fill="currentColor"
        stroke="none"
      />
    </BaseIcon>
  );
}
