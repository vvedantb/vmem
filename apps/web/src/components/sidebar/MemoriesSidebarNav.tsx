import { RouteTabs } from "@/components/shell/RouteTabs";
import { useActiveProfileId } from "@/components/workspace/active-profile";
import { SubSidebarShell } from "./SubSidebarShell";

type MemoriesSidebarNavProps = {
  isMobile: boolean;
};

export function MemoriesSidebarNav({ isMobile }: MemoriesSidebarNavProps) {
  const profileId = useActiveProfileId();

  return (
    <SubSidebarShell isMobile={isMobile}>
      {profileId === undefined ? null : (
        <div className="flex h-11 w-full shrink-0 items-center px-1">
          <RouteTabs
            fullWidth
            aria-label="Memory views"
            tabs={[
              {
                value: "graph",
                to: "/$profileId/memories/graph",
                label: "Graph",
              },
              {
                value: "list",
                to: "/$profileId/memories/list",
                label: "List",
              },
              {
                value: "timeline",
                to: "/$profileId/memories/timeline",
                label: "Timeline",
              },
            ]}
            linkParams={{ profileId }}
            getActiveValue={(matchRoute) => {
              if (matchRoute({ to: "/$profileId/memories/list", fuzzy: true }))
                return "list";
              if (matchRoute({ to: "/$profileId/memories/graph" }))
                return "graph";
              if (matchRoute({ to: "/$profileId/memories/timeline" }))
                return "timeline";
              return "";
            }}
            search
          />
        </div>
      )}
    </SubSidebarShell>
  );
}
