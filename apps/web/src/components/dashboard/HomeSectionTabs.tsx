import { useLocation } from "@tanstack/react-router";
import {
  IconBell,
  IconChecklist,
  IconFileImport,
  IconPlugConnected,
} from "@tabler/icons-react";
import { RouteTabs } from "@/components/shell/RouteTabs";
import { useActiveProfile } from "@/components/workspace/active-profile";

// Nested Inbox and Sources views are page tabs in the main panel rather than
// sidebar destinations.

export type InboxTab = "proposals" | "notifications";
export type SourcesTab = "connectors" | "import";

function subPath(pathname: string): string {
  return pathname.replace(/^\/[^/]+/, "");
}

export function inboxTabFromPathname(pathname: string): InboxTab {
  return /^\/inbox\/notifications\/?$/.test(subPath(pathname))
    ? "notifications"
    : "proposals";
}

export function sourcesTabFromPathname(pathname: string): SourcesTab {
  return /^\/sources\/import\/?$/.test(subPath(pathname))
    ? "import"
    : "connectors";
}

function usePathname(): string {
  return useLocation({ select: (location) => location.pathname });
}

export function InboxTabs() {
  const profile = useActiveProfile();
  const pathname = usePathname();
  return (
    <RouteTabs
      tabs={[
        {
          value: "proposals",
          to: "/$profileId/inbox/proposals",
          label: "Proposals",
          icon: <IconChecklist size={16} />,
        },
        {
          value: "notifications",
          to: "/$profileId/inbox/notifications",
          label: "Notifications",
          icon: <IconBell size={16} />,
        },
      ]}
      linkParams={{ profileId: profile._id }}
      getActiveValue={() => inboxTabFromPathname(pathname)}
    />
  );
}

export function SourcesTabs() {
  const profile = useActiveProfile();
  const pathname = usePathname();
  return (
    <RouteTabs
      tabs={[
        {
          value: "connectors",
          to: "/$profileId/sources/connectors",
          label: "Connectors",
          icon: <IconPlugConnected size={16} />,
        },
        {
          value: "import",
          to: "/$profileId/sources/import",
          label: "Import",
          icon: <IconFileImport size={16} />,
        },
      ]}
      linkParams={{ profileId: profile._id }}
      getActiveValue={() => sourcesTabFromPathname(pathname)}
    />
  );
}
