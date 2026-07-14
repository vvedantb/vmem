import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import type { Memory, MemoryType } from "./memories";
import {
  kindPassesFilter,
  sourcePassesFilter,
  tagsPassFilter,
  typePassesFilter,
} from "./memory-view-filters";

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

interface MemoryRowItem extends BaseListItem {
  kind: "memory";
  type: MemoryType;
  source: string;
  sourceUrl: string | null;
  sourceSyncedAt: string | null;
  profileId?: string;
}

interface WikiDocumentItem extends BaseListItem {
  kind: "wiki-document";
  // convex id for /wiki/<wikiId>
  wikiId: string;
}

interface WikiArtifactItem extends BaseListItem {
  kind: "wiki-artifact";
  wikiId: string;
}

interface WikiFolderItem extends BaseListItem {
  kind: "wiki-folder";
  wikiId: string;
  // direct child count for row meta
  childCount: number;
}

interface SkillItem extends BaseListItem {
  kind: "skill";
  skillId: string;
}

export type ListItem =
  | MemoryRowItem
  | WikiDocumentItem
  | WikiArtifactItem
  | WikiFolderItem
  | SkillItem;

// filter helpers — memory filters pass non-memory items through; kind is cross-cutting

export function listItemMatchesKindFilter(
  item: ListItem,
  selectedKinds: readonly ListItemKind[],
): boolean {
  return kindPassesFilter(item.kind, selectedKinds);
}

export function listItemMatchesTagFilter(
  item: ListItem,
  selectedTags: readonly string[],
): boolean {
  return tagsPassFilter(item.tags, selectedTags, item.kind);
}

export function listItemMatchesSourceFilter(
  item: ListItem,
  selectedSources: readonly string[],
): boolean {
  return sourcePassesFilter(
    item.kind === "memory" ? item.source : undefined,
    selectedSources,
    item.kind,
  );
}

export function listItemMatchesTypeFilter(
  item: ListItem,
  selectedTypes: readonly MemoryType[],
): boolean {
  return typePassesFilter(
    item.kind === "memory" ? item.type : undefined,
    selectedTypes,
    item.kind,
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

type WikiRows = FunctionReturnType<typeof api.wiki.listTree>;

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

type SkillRows = FunctionReturnType<typeof api.skills.listMy>;

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
