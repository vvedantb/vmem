"use client";

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
export function useMemoryListSupplementaryItems() {
  const teamId = useActiveProfile().teamId;
  const wikiRows = useQuery(api.wiki.listTree, { teamId });
  const skillRows = useQuery(api.skills.listMy, { teamId });

  const wikiItems = useMemo(
    () => (wikiRows ? wikiRowsToListItems(wikiRows) : []),
    [wikiRows],
  );

  const skillItems = useMemo(
    () => (skillRows ? skillRowsToListItems(skillRows) : []),
    [skillRows],
  );

  const supplementaryItems = useMemo<ListItem[]>(
    () => [...wikiItems, ...skillItems],
    [wikiItems, skillItems],
  );

  return {
    wikiRows,
    skillRows,
    wikiItems,
    skillItems,
    supplementaryItems,
  };
}
