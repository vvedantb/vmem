/**
 * Custom animated icons for the root sidebar nav.
 *
 * Each icon plays a short signature animation when the parent NavLink
 * (which carries Tailwind's `group` class) is hovered. Shared keyframes
 * live in sidebar-icons.css and are pulled in via BaseIcon.
 *
 * Drop-in compatible with tabler icons via the NavIcon shape
 * (`{ className?, size?, stroke? }`).
 */

export { IconChat } from "./IconChat";
export { IconVoice } from "./IconVoice";
export { IconMemories } from "./IconMemories";
export { IconTeams } from "./IconTeams";
export { IconFiles } from "./IconFiles";
export { IconCodebases } from "./IconCodebases";
export { IconSkills } from "./IconSkills";
export { IconWiki } from "./IconWiki";
export { IconActivity } from "./IconActivity";
export { IconInbox } from "./IconInbox";
export { IconSettings } from "./IconSettings";
export type { SidebarIconProps } from "./BaseIcon";
