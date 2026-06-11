import type { Memory, MemoryType, TagSortMode, TagStats } from "@/lib/memories";
import type { ListItem, ListItemKind } from "@/lib/list-items";

export type FilterTab = "kind" | "tags" | "source" | "type";

export const TAG_SORT_LABELS: Record<TagSortMode, string> = {
  "a-z": "A–Z",
  "most-used": "Most used",
  "most-recent": "Most recent",
};

export const TAG_SORT_OPTIONS: TagSortMode[] = [
  "a-z",
  "most-used",
  "most-recent",
];

export interface UnifiedFilterPanelProps {
  /** All memories for tag/source/type counts (list view) */
  allMemories?: Memory[];
  /** All items (memories + wiki + skills) for kind counts (list view) */
  allItems?: ListItem[];

  // Kinds - supports both array (list) and Set (graph) styles
  selectedKinds?: ListItemKind[];
  onKindsChange?: (kinds: ListItemKind[]) => void;
  /** Graph-style kind counts - if provided, used instead of computing from allItems */
  kindCounts?: Record<ListItemKind, number>;

  // Tags - supports both array (list) and Set (graph) styles
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
  /** Graph-style tag stats - if provided, used instead of computing from allMemories */
  tagStats?: TagStats[];

  // Sources (list view only)
  distinctSources?: string[];
  selectedSources?: string[];
  onSourcesChange?: (sources: string[]) => void;

  // Types (list view only)
  selectedTypes?: MemoryType[];
  onTypesChange?: (types: MemoryType[]) => void;
  /** Graph-style type counts - if provided, used instead of computing from allMemories */
  typeCounts?: Record<MemoryType, number>;

  // Result count
  filteredCount: number;
  totalCount: number;

  /**
   * Reset every filter at once. Must be a single atomic update - clearing
   * filters one-by-one via the individual handlers races when those handlers
   * read from stale URL/closure state (see graph view's toggle-based adapters).
   */
  onClearAll: () => void;

  isDark: boolean;

  /**
   * Which tabs to show. Defaults to all 5. Kept configurable so embeddings
   * that only care about a subset (e.g. a dialog scoped to picking a tag)
   * can hide the rest.
   */
  visibleTabs?: FilterTab[];
}
