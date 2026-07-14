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

function isMemoryType(value: string): value is MemoryType {
  return MEMORY_TYPES.some((type) => type === value);
}

// fields shared by list / retrieve / getMemory api payloads
export type MemoryApiFields = {
  id: string;
  title: string;
  content: string;
  type: string;
  source: string;
  tags: string[];
  createdAt: string;
  sourceUrl?: string | null;
  sourceSyncedAt?: string | null;
  profileId?: string | null;
};

// normalize api / retrieve / getMemory payloads into the client Memory shape
export function memoryFromApi(m: MemoryApiFields): Memory {
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    type: isMemoryType(m.type) ? m.type : "knowledge",
    source: m.source,
    sourceUrl: m.sourceUrl ?? null,
    sourceSyncedAt: m.sourceSyncedAt ?? null,
    tags: m.tags,
    createdAt: m.createdAt,
    profileId: m.profileId ?? undefined,
  };
}

const MEMORY_SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  "browser-extension": "Extension",
  "prompt-capture": "Prompt Capture",
  youtube: "YouTube",
  google_drive: "Google Drive",
  notion: "Notion",
  mcp: "MCP",
  cursor: "Cursor",
  "client-enrichment": "Enrichment",
};

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
