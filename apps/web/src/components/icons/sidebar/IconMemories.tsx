import { BaseIcon, type SidebarIconProps } from "./BaseIcon";

// brain with a firing synapse
export function IconMemories(props: SidebarIconProps) {
  return (
    <BaseIcon {...props}>
      {/* Brain silhouette (symmetric about x=12) */}
      <path
        d="M12 3.5C8.5 2.2 5.5 3.3 5 6.5C2.8 7 2.5 8.5 3.5 10C2.2 11.5 2.5 13.5 4.5 14.5C4.5 17 6 18.5 8 18.5C9.5 20 11 19.6 12 19C13 19.6 14.5 20 16 18.5C18 18.5 19.5 17 19.5 14.5C21.5 13.5 21.8 11.5 20.5 10C21.5 8.5 21.2 7 19 6.5C18.5 3.3 15.5 2.2 12 3.5Z"
        fill="none"
      />
      {/* Central fissure between the hemispheres */}
      <path d="M12 3.9C10.6 6.5 13.4 8.8 12 11.4" fill="none" />
      {/* Synapse ping ring (fires on hover) */}
      <circle className="sb-mem-ring" cx="12" cy="13.8" r="2.2" fill="none" />
      {/* Synapse core */}
      <circle
        className="sb-mem-core"
        cx="12"
        cy="13.8"
        r="1.7"
        fill="currentColor"
        stroke="none"
      />
    </BaseIcon>
  );
}
