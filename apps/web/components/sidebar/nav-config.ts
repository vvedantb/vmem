import {
  IconMessageCircle,
  IconBrain,
  IconKey,
  IconBell,
  IconSettings,
  IconFiles,
  IconDatabase,
  IconPlugConnected,
  IconList,
  IconShare3,
  IconFileText,
  IconStack2,
  IconPlug,
  IconUserCircle,
} from "@tabler/icons-react";
import type { NavGroup } from "./types";

export const navGroups: NavGroup[] = [
  {
    title: "Workspace",
    icon: IconStack2,
    items: [
      { href: "/chat", label: "Chat", icon: IconMessageCircle },
      {
        href: "/memories",
        label: "Memories",
        icon: IconBrain,
        children: [
          { href: "/memories/list", label: "List", icon: IconList },
          { href: "/memories/graph", label: "Graph", icon: IconShare3 },
        ],
      },
      { href: "/files", label: "Files", icon: IconFiles },
      { href: "/index", label: "Index", icon: IconDatabase },
    ],
  },
  {
    title: "Integrations",
    icon: IconPlug,
    items: [
      {
        href: "/api",
        label: "API Keys",
        icon: IconKey,
        children: [
          { href: "/api/logs", label: "Usage", icon: IconFileText },
          { href: "/api/keys", label: "Keys", icon: IconKey },
        ],
      },
      { href: "/connectors", label: "Connectors", icon: IconPlugConnected },
    ],
  },
  {
    title: "Account",
    icon: IconUserCircle,
    items: [
      { href: "/notifications", label: "Notifications", icon: IconBell },
      { href: "/settings", label: "Settings", icon: IconSettings },
    ],
  },
];
