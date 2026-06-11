export type MemoryType = "profile" | "episodic" | "knowledge";

export const MEMORY_TYPES: readonly MemoryType[] = [
  "profile",
  "episodic",
  "knowledge",
];

const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  profile: "Profile",
  episodic: "Episodic",
  knowledge: "Knowledge",
};

export function formatMemoryTypeLabel(type: MemoryType): string {
  return MEMORY_TYPE_LABELS[type];
}

export interface Memory {
  id: string;
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  sourceUrl: string | null;
  sourceSyncedAt: string | null;
  tags: string[];
  createdAt: string;
  profileId?: string;
}

const MEMORY_SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  "browser-extension": "Extension",
  "prompt-capture": "Prompt Capture",
  youtube: "YouTube",
  google_drive: "Google Drive",
  gmail: "Gmail",
  onedrive: "OneDrive",
  linear: "Linear",
  linear_project: "Linear project",
  notion: "Notion",
  mcp: "MCP",
  "client-enrichment": "Enrichment",
};

export function memoryMatchesTagFilters(
  memory: Memory,
  selectedTags: string[],
): boolean {
  if (selectedTags.length === 0) {
    return true;
  }
  return selectedTags.every((tag) =>
    memory.tags.some((mt) => mt.toLowerCase() === tag.toLowerCase()),
  );
}

export function memoryMatchesSourceFilters(
  memory: Memory,
  selectedSources: string[],
): boolean {
  if (selectedSources.length === 0) {
    return true;
  }
  return selectedSources.includes(memory.source);
}

export function memoryMatchesTypeFilters(
  memory: Memory,
  selectedTypes: MemoryType[],
): boolean {
  if (selectedTypes.length === 0) {
    return true;
  }
  return selectedTypes.includes(memory.type);
}

export function formatMemorySourceLabel(source: string): string {
  const mapped = MEMORY_SOURCE_LABELS[source];
  if (mapped !== undefined) {
    return mapped;
  }
  const normalized = source.replace(/[-_]+/g, " ").trim();
  if (normalized.length === 0) {
    return source;
  }
  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export interface TagStats {
  tag: string;
  count: number;
  latestCreatedAt: string;
}

export interface SearchResult extends Memory {
  relevanceScore: number;
}

export function buildTagStats(memories: Memory[]): TagStats[] {
  const counts = new Map<string, number>();
  const latest = new Map<string, string>();

  for (const memory of memories) {
    for (const tag of memory.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
      const current = latest.get(tag);
      if (!current || memory.createdAt > current) {
        latest.set(tag, memory.createdAt);
      }
    }
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({
      tag,
      count,
      latestCreatedAt: latest.get(tag) ?? "",
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

export type TagSortMode = "a-z" | "most-used" | "most-recent";

export function sortTagStats(tags: TagStats[], mode: TagSortMode): TagStats[] {
  const sorted = [...tags];
  switch (mode) {
    case "a-z":
      return sorted.sort((a, b) => a.tag.localeCompare(b.tag));
    case "most-used":
      return sorted.sort(
        (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
      );
    case "most-recent":
      return sorted.sort(
        (a, b) =>
          b.latestCreatedAt.localeCompare(a.latestCreatedAt) ||
          a.tag.localeCompare(b.tag),
      );
  }
}

export function timeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000,
  );
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function searchMemories(
  memories: Memory[],
  query: string,
): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  const maxScore = terms.length * 5;

  return memories
    .map((memory) => {
      const title = memory.title.toLowerCase();
      const content = memory.content.toLowerCase();
      const tags = memory.tags.map((tag) => tag.toLowerCase());

      let score = 0;
      for (const term of terms) {
        if (title === term) {
          score += 5;
          continue;
        }

        if (title.includes(term)) {
          score += 3;
        }

        if (tags.some((tag) => tag === term)) {
          score += 3;
        } else if (tags.some((tag) => tag.includes(term))) {
          score += 2;
        }

        if (content.includes(term)) {
          score += 1;
        }
      }

      return {
        ...memory,
        relevanceScore: Math.min(1, score / maxScore),
      };
    })
    .filter((memory) => memory.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
