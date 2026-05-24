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
