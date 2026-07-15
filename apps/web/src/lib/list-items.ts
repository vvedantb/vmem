import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import type { Memory } from "./memories";
import {
  apiGraphNodePassesFilters,
  type MemoryViewFilterParams,
} from "./memory-view-filters";

type WikiRows = FunctionReturnType<typeof api.wiki.listTree>;
type SkillRows = FunctionReturnType<typeof api.skills.listMy>;

// unified /memories list item (memory | wiki | skill) mirroring graph node kinds
export type ListItemKind =
  | "memory"
  | "wiki-document"
  | "wiki-artifact"
  | "wiki-folder"
  | "skill"
  | "entity";

// kind order for filter ui — fixed, never shuffle
export const LIST_ITEM_KINDS: readonly ListItemKind[] = [
  "memory",
  "entity",
  "wiki-document",
  "wiki-artifact",
  "wiki-folder",
  "skill",
];

const LIST_ITEM_KIND_LABELS: Record<ListItemKind, string> = {
  memory: "Memories",
  entity: "Entities",
  "wiki-document": "Wiki docs",
  "wiki-artifact": "Artifacts",
  "wiki-folder": "Folders",
  skill: "Skills",
};

export function formatListItemKindLabel(kind: ListItemKind): string {
  return LIST_ITEM_KIND_LABELS[kind];
}

interface BaseListItem {
  // namespaced id (wiki:/skill: or raw memory id)
  id: string;
  title: string;
  // body for search scoring; empty for folders
  content: string;
  // always an array (empty for non-memory)
  tags: string[];
  // iso timestamp — sortable as string
  createdAt: string;
}

type MemoryRowItem = BaseListItem &
  Pick<
    Memory,
    "type" | "source" | "sourceUrl" | "sourceSyncedAt" | "profileId"
  > & {
    kind: "memory";
  };

type WikiDocumentItem = BaseListItem & {
  kind: "wiki-document";
  // convex id for /wiki/<wikiId> (string form of WikiRows[number]["_id"])
  wikiId: string;
};

type WikiArtifactItem = BaseListItem & {
  kind: "wiki-artifact";
  wikiId: string;
};

type WikiFolderItem = BaseListItem & {
  kind: "wiki-folder";
  wikiId: string;
  // direct child count for row meta
  childCount: number;
};

type SkillItem = BaseListItem & {
  kind: "skill";
  skillId: string;
};

export type ListItem =
  | MemoryRowItem
  | WikiDocumentItem
  | WikiArtifactItem
  | WikiFolderItem
  | SkillItem;

// filter helpers — memory filters pass non-memory items through; kind is cross-cutting

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

// builders

const WIKI_PREFIX = "wiki:";
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
  };
}

// wiki rows → list items; one pass for folder child counts
export function wikiRowsToListItems(rows: WikiRows): ListItem[] {
  const childCount = new Map<string, number>();
  for (const row of rows) {
    if (row.parentId !== undefined) {
      childCount.set(row.parentId, (childCount.get(row.parentId) ?? 0) + 1);
    }
  }
  return rows.map((row): ListItem => {
    const createdAt = new Date(row.createdAt).toISOString();
    if (row.kind === "folder") {
      return {
        kind: "wiki-folder",
        id: `${WIKI_PREFIX}${row._id}`,
        wikiId: row._id,
        title: row.title,
        content: "",
        tags: [],
        createdAt,
        childCount: childCount.get(row._id) ?? 0,
      };
    }
    if (row.kind === "artifact") {
      return {
        kind: "wiki-artifact",
        id: `${WIKI_PREFIX}${row._id}`,
        wikiId: row._id,
        title: row.title,
        content: row.contentText ?? "",
        tags: [],
        createdAt,
      };
    }
    return {
      kind: "wiki-document",
      id: `${WIKI_PREFIX}${row._id}`,
      wikiId: row._id,
      title: row.title,
      content: row.contentText ?? "",
      tags: [],
      createdAt,
    };
  });
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

// search

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
