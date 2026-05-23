import { BaseIcon, type SidebarIconProps } from "./BaseIcon";

/**
 * Stylized memory-graph node: 4 outer nodes connected to a central hub
 * that pulses on hover -- on-brand for vmem's graph storage model.
 */
export function IconMemories(props: SidebarIconProps) {
  return (
    <BaseIcon {...props}>
      <line x1="12" y1="12" x2="6" y2="6" />
      <line x1="12" y1="12" x2="18" y2="6" />
      <line x1="12" y1="12" x2="6" y2="18" />
      <line x1="12" y1="12" x2="18" y2="18" />
      <circle cx="6" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle
        className="sb-mem-pulse"
        cx="12"
        cy="12"
        r="2.4"
        fill="currentColor"
        stroke="none"
      />
    </BaseIcon>
  );
}
