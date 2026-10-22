import { useLocation } from "@tanstack/react-router";
import { IconFileImport, IconPlugConnected } from "@tabler/icons-react";
import { RouteTabs } from "@/components/shell/RouteTabs";
import { useActiveProfile } from "@/components/workspace/active-profile";

// Nested Sources views are page tabs in the main panel rather than sidebar
// destinations. The Inbox has no tabs: it is notifications only.

export type SourcesTab = "connectors" | "import";

function subPath(pathname: string): string {
  return pathname.replace(/^\/[^/]+/, "");
}

export function sourcesTabFromPathname(pathname: string): SourcesTab {
  return /^\/sources\/import\/?$/.test(subPath(pathname))
    ? "import"
    : "connectors";
}

function usePathname(): string {
  return useLocation({ select: (location) => location.pathname });
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
