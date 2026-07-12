import {
  IconBook,
  IconBriefcase,
  IconBulb,
  IconCamera,
  IconCode,
  IconDeviceGamepad,
  IconHeart,
  IconHome,
  IconMusic,
  IconRocket,
  IconStar,
  IconUser,
} from "@tabler/icons-react-native";

/** Same palette + icon set as web settings/profiles.tsx — keep in sync. */
export const PROFILE_COLORS = [
  "#171717", // black (brand default)
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#6B7280", // gray
] as const;

export const PROFILE_ICONS = [
  { name: "user", icon: IconUser },
  { name: "briefcase", icon: IconBriefcase },
  { name: "home", icon: IconHome },
  { name: "code", icon: IconCode },
  { name: "book", icon: IconBook },
  { name: "heart", icon: IconHeart },
  { name: "star", icon: IconStar },
  { name: "rocket", icon: IconRocket },
  { name: "lightbulb", icon: IconBulb },
  { name: "music", icon: IconMusic },
  { name: "camera", icon: IconCamera },
  { name: "gamepad", icon: IconDeviceGamepad },
] as const;

export function getProfileIcon(iconName: string) {
  const found = PROFILE_ICONS.find((i) => i.name === iconName);
  return found?.icon ?? IconUser;
}
