import { Link, useMatchRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, AnimatedTabLabel } from "@vmem/ui";
import type { Id } from "@vmem/backend";

interface TeamTabsProps {
  teamId: Id<"teams">;
  isOwner: boolean;
}

export function TeamTabs({ teamId, isOwner }: TeamTabsProps) {
  const matchRoute = useMatchRoute();
  const activeValue = matchRoute({ to: "/teams/$teamId/knowledge" })
    ? "knowledge"
    : matchRoute({ to: "/teams/$teamId/members" })
      ? "members"
      : matchRoute({ to: "/teams/$teamId/settings" })
        ? "settings"
        : "overview";

  const linkParams = { teamId };

  return (
    <Tabs value={activeValue}>
      <TabsList>
        <TabsTrigger value="overview" asChild>
          <Link to="/teams/$teamId/overview" params={linkParams}>
            <AnimatedTabLabel
              isActive={activeValue === "overview"}
              label="Overview"
            />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="knowledge" asChild>
          <Link to="/teams/$teamId/knowledge" params={linkParams}>
            <AnimatedTabLabel
              isActive={activeValue === "knowledge"}
              label="Knowledge"
            />
          </Link>
        </TabsTrigger>
        <TabsTrigger value="members" asChild>
          <Link to="/teams/$teamId/members" params={linkParams}>
            <AnimatedTabLabel
              isActive={activeValue === "members"}
              label="Members"
            />
          </Link>
        </TabsTrigger>
        {isOwner ? (
          <TabsTrigger value="settings" asChild>
            <Link to="/teams/$teamId/settings" params={linkParams}>
              <AnimatedTabLabel
                isActive={activeValue === "settings"}
                label="Settings"
              />
            </Link>
          </TabsTrigger>
        ) : null}
      </TabsList>
    </Tabs>
  );
}
