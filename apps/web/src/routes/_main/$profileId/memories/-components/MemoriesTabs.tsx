import { IconTopologyStar3, IconList } from "@tabler/icons-react";
import { RouteTabs } from "@/components/RouteTabs";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { MemoriesSearchUrlSanitizer } from "./MemoriesSearchUrlSanitizer";

export function MemoriesTabs() {
  const profile = useActiveProfile();
  return (
    <>
      <MemoriesSearchUrlSanitizer />
      <RouteTabs
        tabs={[
          {
            value: "graph",
            to: "/$profileId/memories/graph",
            label: "Graph",
            icon: <IconTopologyStar3 size={16} />,
          },
          {
            value: "list",
            to: "/$profileId/memories/list",
            label: "List",
            icon: <IconList size={16} />,
          },
        ]}
        linkParams={{ profileId: profile._id }}
        getActiveValue={(matchRoute) => {
          if (matchRoute({ to: "/$profileId/memories/list", fuzzy: true }))
            return "list";
          if (matchRoute({ to: "/$profileId/memories/graph" })) return "graph";
          return "";
        }}
        search
      />
    </>
  );
}
