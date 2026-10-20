// profile colour swatches and icon names, shared by the web picker and the
// backend checks (profiles.create / update and the MCP profile tools)
export const PROFILE_COLORS = [
  "#171717", // black (brand default)
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#6B7280", // grey
] as const;

export const PROFILE_ICON_NAMES = [
  "user",
  "briefcase",
  "home",
  "code",
  "book",
  "heart",
  "star",
  "rocket",
  "lightbulb",
  "music",
  "camera",
  "gamepad",
] as const;

export type ProfileIconName = (typeof PROFILE_ICON_NAMES)[number];

export function isProfileIconName(name: string): name is ProfileIconName {
  return PROFILE_ICON_NAMES.some((iconName) => iconName === name);
}

export function isProfileColor(color: string): boolean {
  return PROFILE_COLORS.some((swatch) => swatch === color);
}
