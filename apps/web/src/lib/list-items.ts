import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import type { Memory } from "./memories";
import {
  apiGraphNodePassesFilters,
  type MemoryViewFilterParams,
} from "./memory-view-filters";

type SkillRows = FunctionReturnType<typeof api.skills.listMy>;

// unified /memories list item (memory | entity | skill) mirroring graph node kinds
export type ListItemKind = "memory" | "skill" | "entity";

// kind order for filter ui fixed, never shuffle
export const LIST_ITEM_KINDS: readonly ListItemKind[] = [
  "memory",
  "entity",
  "skill",
];

const LIST_ITEM_KIND_LABELS: Record<ListItemKind, string> = {
  memory: "Memories",
  entity: "Entities",
  skill: "Skills",
};

export function formatListItemKindLabel(kind: ListItemKind): string {
  return LIST_ITEM_KIND_LABELS[kind];
}

interface BaseListItem {
  // namespaced id (skill or raw memory id)
  id: string;
  title: string;
  // body for search scoring empty for folders
  content: string;
  // always an array (empty for non-memory)
  tags: string[];
  // iso timestamp sortable as string
  createdAt: string;
}

type MemoryRowItem = BaseListItem &
  Pick<
    Memory,
    | "type"
    | "source"
    | "sourceUrl"
    | "sourceSyncedAt"
    | "profileId"
    | "usefulnessScore"
  > & {
    kind: "memory";
  };

type SkillItem = BaseListItem & {
  kind: "skill";
  skillId: string;
};

export type ListItem = MemoryRowItem | SkillItem;

// filter helpers: memory filters pass non-memory items through, kind is cross-cutting

export function listItemPassesFilters(
  item: ListItem,
  filters: Pick<MemoryViewFilterParams, "kinds" | "tags" | "sources" | "types">,
): boolean {
  return apiGraphNodePassesFilters(
    {
      kind: item.kind,
      tags: item.tags,
      source: item.kind === "memory" ? item.source : undefined,
      type: item.kind === "memory" ? item.type : undefined,
    },
    filters,
  );
}

const SKILL_PREFIX = "skill:";

export function memoryToListItem(memory: Memory): ListItem {
  return {
    kind: "memory",
    id: memory.id,
    title: memory.title,
    content: memory.content,
    tags: memory.tags,
    createdAt: memory.createdAt,
    type: memory.type,
    source: memory.source,
    sourceUrl: memory.sourceUrl,
    sourceSyncedAt: memory.sourceSyncedAt,
    profileId: memory.profileId,
    usefulnessScore: memory.usefulnessScore,
  };
}

export function listItemToMemory(
  item: Extract<ListItem, { kind: "memory" }>,
): Memory {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    tags: item.tags,
    createdAt: item.createdAt,
    type: item.type,
    source: item.source,
    sourceUrl: item.sourceUrl,
    sourceSyncedAt: item.sourceSyncedAt,
    ...(item.usefulnessScore !== undefined
      ? { usefulnessScore: item.usefulnessScore }
      : {}),
    ...(item.profileId !== undefined ? { profileId: item.profileId } : {}),
  };
}

export function skillRowsToListItems(rows: SkillRows): ListItem[] {
  return rows
    .filter((row) => row.enabled !== false)
    .map(
      (row): ListItem => ({
        kind: "skill",
        id: `${SKILL_PREFIX}${row._id}`,
        skillId: row._id,
        title: row.name,
        content: row.description,
        tags: [],
        createdAt: new Date(row.createdAt).toISOString(),
      }),
    );
}

export interface ListItemSearchResult {
  item: ListItem;
  relevanceScore: number;
}

// score title > tags > content, normalised to [0, 1]
// AI-generated (Claude), prompt: "score list items by title tags content term matches"
// Modified by me: normalised score range and empty query early return
export function searchListItems(
  items: readonly ListItem[],
  query: string,
): ListItemSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }
  const maxScore = terms.length * 5;

  const scored: ListItemSearchResult[] = [];
  for (const item of items) {
    const title = item.title.toLowerCase();
    const content = item.content.toLowerCase();
    const tags = item.tags.map((tag) => tag.toLowerCase());

    let score = 0;
    for (const term of terms) {
      if (title === term) {
        score += 5;
        continue;
      }
      if (title.includes(term)) {
        score += 3;
      }
      if (tags.some((t) => t === term)) {
        score += 3;
      } else if (tags.some((t) => t.includes(term))) {
        score += 2;
      }
      if (content.includes(term)) {
        score += 1;
      }
    }

    if (score > 0) {
      scored.push({
        item,
        relevanceScore: Math.min(1, score / maxScore),
      });
    }
  }
  return scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
}
