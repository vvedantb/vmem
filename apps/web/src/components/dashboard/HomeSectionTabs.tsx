import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  IconBell,
  IconChecklist,
  IconFileImport,
  IconInbox,
  IconLayoutDashboard,
  IconPlugConnected,
} from "@tabler/icons-react";
import { RouteTabs } from "@/components/shell/RouteTabs";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { useNotifications } from "@/contexts/NotificationContext";
import { useProposals } from "@/hooks/useProposals";

// Dashboard, Inbox, and Sources share the Home rail section. They are page
// tabs in the main panel rather than sidebar destinations.

export type HomeSectionTab = "dashboard" | "inbox" | "sources";
export type InboxTab = "proposals" | "notifications";
export type SourcesTab = "connectors" | "import";

function subPath(pathname: string): string {
  return pathname.replace(/^\/[^/]+/, "");
}

export function homeSectionTabFromPathname(pathname: string): HomeSectionTab {
  const sub = subPath(pathname);
  if (/^\/inbox(\/|$)/.test(sub)) return "inbox";
  if (/^\/sources(\/|$)/.test(sub)) return "sources";
  return "dashboard";
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

function InboxCount() {
  const { unreadCount } = useNotifications();
  const { pendingCount } = useProposals();
  const total = unreadCount + pendingCount;
  if (total <= 0) return null;
  return (
    <span className="tabular-nums text-muted">
      {total > 99 ? "99+" : total}
    </span>
  );
}

function HomeSectionTabs() {
  const profile = useActiveProfile();
  const pathname = usePathname();
  return (
    <RouteTabs
      tabs={[
        {
          value: "dashboard",
          to: "/$profileId/home",
          label: "Dashboard",
          icon: <IconLayoutDashboard size={16} />,
        },
        {
          value: "inbox",
          to: "/$profileId/inbox",
          label: "Inbox",
          icon: <IconInbox size={16} />,
          badge: <InboxCount />,
        },
        {
          value: "sources",
          to: "/$profileId/sources",
          label: "Sources",
          icon: <IconPlugConnected size={16} />,
        },
      ]}
      linkParams={{ profileId: profile._id }}
      getActiveValue={() => homeSectionTabFromPathname(pathname)}
    />
  );
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

// Section tabs with an optional nested row (Proposals | Notifications,
// Connectors | Import) stacked underneath. Pass to `PageContainer.tabs`.
export function HomeSectionTabRows({ nested }: { nested?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <HomeSectionTabs />
      {nested}
    </div>
  );
}
