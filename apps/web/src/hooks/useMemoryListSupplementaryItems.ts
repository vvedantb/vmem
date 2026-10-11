import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { skillRowsToListItems, type ListItem } from "@/lib/list-items";

export function useMemoryListSupplementaryItems(): ListItem[] {
  const teamId = useActiveProfile().teamId;
  const skillRows = useQuery(api.skills.listMy, { teamId });
  return skillRows ? skillRowsToListItems(skillRows) : [];
}
