import { BaseIcon, type SidebarIconProps } from "./BaseIcon";

export function IconVoice(props: SidebarIconProps) {
  return (
    <BaseIcon {...props}>
      <path
        className="sb-voice-wave sb-voice-wave-l"
        d="M3 10a3 3 0 0 0 0 4"
        strokeWidth="1.5"
      />
      <path
        className="sb-voice-wave sb-voice-wave-r"
        d="M21 10a3 3 0 0 1 0 4"
        strokeWidth="1.5"
      />
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 19v3" />
    </BaseIcon>
  );
}
