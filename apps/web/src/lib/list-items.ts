import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import type { Memory, MemoryType } from "./memories";
import {
  kindPassesFilter,
  sourcePassesFilter,
  tagsPassFilter,
  typePassesFilter,
} from "./memory-view-filters";

/**
 * Unified list-item model for the /memories list view.
 *
 * The graph view already merges four kinds of nodes (memories, wiki documents,
 * wiki folders, skills) into one `ApiGraphNode` stream. The list view now
 * mirrors that so users can browse the same four kinds in a flat, scrollable
 * form. Memory items carry extra memory-only fields (`type`, `source`) that
 * feed the existing Type/Source filters; other kinds pass through those
 * filters untouched.
 *
 * Ids are namespaced (`wiki:<id>`, `skill:<id>`) to match the graph and avoid
 * id collisions if two kinds ever share a detail panel.
 */
export type ListItemKind =
  | "memory"
  | "wiki-document"
  | "wiki-folder"
  | "skill"
  | "entity";

/** Canonical ordering for kinds in filter UI — never shuffle regardless of data. */
export const LIST_ITEM_KINDS: readonly ListItemKind[] = [
  "memory",
  "entity",
  "wiki-document",
  "wiki-folder",
  "skill",
];

const LIST_ITEM_KIND_LABELS: Record<ListItemKind, string> = {
  memory: "Memories",
  entity: "Entities",
  "wiki-document": "Wiki docs",
  "wiki-folder": "Folders",
  skill: "Skills",
};

export function formatListItemKindLabel(kind: ListItemKind): string {
  return LIST_ITEM_KIND_LABELS[kind];
}

interface BaseListItem {
  /** Namespaced unique id (wiki:/skill: prefix or raw memory id). */
  id: string;
  title: string;
  /** Free-form body text used for search scoring. Empty for folders. */
  content: string;
  /** Always an array (empty for non-memory kinds) so callers don't branch. */
  tags: string[];
  /** ISO timestamp — sortable as a string. */
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
  /** Raw Convex id, used to deep-link into /wiki/<wikiId>. */
  wikiId: string;
}

interface WikiFolderItem extends BaseListItem {
  kind: "wiki-folder";
  wikiId: string;
  /** Direct child count — shown as "N items" in the row meta. */
  childCount: number;
}

interface SkillItem extends BaseListItem {
  kind: "skill";
  skillId: string;
}

export type ListItem =
  | MemoryRowItem
  | WikiDocumentItem
  | WikiFolderItem
  | SkillItem;

// ---- Filter helpers -------------------------------------------------------
//
// Memory-scoped filters (tag/source/type) pass non-memory items through so
// setting a tag filter doesn't silently hide every wiki doc and skill. The
// kind filter is the only cross-cutting filter.

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

// ---- Builders -------------------------------------------------------------

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

/**
 * Turns raw wiki rows into list items. Computes direct-child counts in one
 * pass so folder rows can show "N items" without re-scanning the tree.
 */
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

// ---- Search ---------------------------------------------------------------

export interface ListItemSearchResult {
  item: ListItem;
  relevanceScore: number;
}

/**
 * Lightweight relevance scorer. Scores title > tags > content, normalised to
 * [0, 1]. Folders have no tags/content so they only score on title — acceptable
 * because folders are usually found by name anyway.
 */
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
