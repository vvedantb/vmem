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
  type IconProps,
} from "@tabler/icons-react-native";
import {
  isProfileIconName,
  PROFILE_ICON_NAMES,
  type ProfileIconName,
} from "@vmem/shared";
import type { ComponentType } from "react";

type ProfileIcon = ComponentType<IconProps>;

const PROFILE_ICON_MAP: Record<ProfileIconName, ProfileIcon> = {
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

/** The icon for a stored name. An unknown name falls back to the user icon. */
export function getProfileIcon(iconName: string): ProfileIcon {
  return isProfileIconName(iconName) ? PROFILE_ICON_MAP[iconName] : IconUser;
}

/** Select options for the icon picker, in the web order. */
export const PROFILE_ICON_OPTIONS = PROFILE_ICON_NAMES.map((name) => ({
  label: name.charAt(0).toUpperCase() + name.slice(1),
  value: name,
}));
