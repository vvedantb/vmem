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
import {
  isProfileIconName,
  PROFILE_ICON_NAMES,
  type ProfileIconName,
} from "@vmem/shared";

export { PROFILE_COLORS } from "@vmem/shared";

const PROFILE_ICON_MAP: Record<ProfileIconName, TablerIcon> = {
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
  return isProfileIconName(iconName) ? PROFILE_ICON_MAP[iconName] : IconUser;
}

// ordered icon choices for the profile create/edit picker
export const PROFILE_ICON_OPTIONS: { name: string; icon: TablerIcon }[] =
  PROFILE_ICON_NAMES.map((name) => ({ name, icon: PROFILE_ICON_MAP[name] }));
