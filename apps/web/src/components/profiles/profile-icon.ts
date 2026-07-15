import type { TablerIcon } from "@tabler/icons-react";
import {
  IconBook,
  IconBriefcase,
  IconCamera,
  IconCode,
  IconDeviceGamepad,
  IconHeart,
  IconHome,
  IconBulb,
  IconMusic,
  IconRocket,
  IconStar,
  IconUser,
} from "@tabler/icons-react";

const PROFILE_ICON_MAP: Record<string, TablerIcon> = {
  user: IconUser,
  briefcase: IconBriefcase,
  home: IconHome,
  code: IconCode,
  book: IconBook,
  heart: IconHeart,
  star: IconStar,
  rocket: IconRocket,
  lightbulb: IconBulb,
  music: IconMusic,
  camera: IconCamera,
  gamepad: IconDeviceGamepad,
};

export function getProfileIcon(iconName: string): TablerIcon {
  const icon = PROFILE_ICON_MAP[iconName];
  if (icon) return icon;
  return IconUser;
}

// ordered icon choices for the profile create/edit picker
export const PROFILE_ICON_OPTIONS: { name: string; icon: TablerIcon }[] =
  Object.entries(PROFILE_ICON_MAP).map(([name, icon]) => ({ name, icon }));

// colour swatches for the profile create/edit picker
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
