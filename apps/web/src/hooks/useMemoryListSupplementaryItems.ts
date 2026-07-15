import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import {
  skillRowsToListItems,
  wikiRowsToListItems,
  type ListItem,
} from "@/lib/list-items";

/** Wiki + skill rows merged into list items (shared by list entries and filter stats). */
export function useMemoryListSupplementaryItems(): ListItem[] {
  const teamId = useActiveProfile().teamId;
  const wikiRows = useQuery(api.wiki.listTree, { teamId });
  const skillRows = useQuery(api.skills.listMy, { teamId });

  return useMemo<ListItem[]>(() => {
    const wikiItems = wikiRows ? wikiRowsToListItems(wikiRows) : [];
    const skillItems = skillRows ? skillRowsToListItems(skillRows) : [];
    return [...wikiItems, ...skillItems];
  }, [wikiRows, skillRows]);
}
