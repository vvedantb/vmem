"use client";

import { IconTopologyStar3, IconList } from "@tabler/icons-react";
import { useQueryStates } from "nuqs";
import { RouteTabs } from "@/components/RouteTabs";
import { memoriesSearchParams } from "../-searchParams";

export function MemoriesTabs() {
  const [params] = useQueryStates(memoriesSearchParams);

  return (
    <RouteTabs
      tabs={[
        {
          value: "graph",
          to: "/memories/graph",
          label: "Graph",
          icon: <IconTopologyStar3 size={16} />,
        },
        {
          value: "list",
          to: "/memories/list",
          label: "List",
          icon: <IconList size={16} />,
        },
      ]}
      getActiveValue={(matchRoute) => {
        if (matchRoute({ to: "/memories/list" })) return "list";
        if (matchRoute({ to: "/memories/graph" })) return "graph";
        return "";
      }}
      search={params}
    />
  );
}
