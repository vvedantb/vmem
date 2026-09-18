import { RouteTabs } from "@/components/shell/RouteTabs";
import { useActiveProfileId } from "@/components/workspace/active-profile";
import { SubSidebarShell } from "./SubSidebarShell";

type ActivitySidebarNavProps = {
  isMobile: boolean;
};

export function ActivitySidebarNav({ isMobile }: ActivitySidebarNavProps) {
  const profileId = useActiveProfileId();

  return (
    <SubSidebarShell isMobile={isMobile}>
      {profileId === undefined ? null : (
        <div className="flex h-11 w-full shrink-0 items-center px-1">
          <RouteTabs
            fullWidth
            aria-label="Activity views"
            tabs={[
              {
                value: "usage",
                to: "/$profileId/activity/usage",
                label: "Usage",
              },
              {
                value: "events",
                to: "/$profileId/activity/events",
                label: "Events",
              },
            ]}
            linkParams={{ profileId }}
            getActiveValue={(matchRoute) =>
              matchRoute({ to: "/$profileId/activity/events" })
                ? "events"
                : "usage"
            }
          />
        </div>
      )}
    </SubSidebarShell>
  );
}
