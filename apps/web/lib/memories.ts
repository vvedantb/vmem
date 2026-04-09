export type MemoryType = "profile" | "episodic" | "knowledge";

export interface Memory {
  id: string;
  title: string;
  content: string;
  type: MemoryType;
  tags: string[];
  createdAt: string;
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
