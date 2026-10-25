import type { TagMerge } from "../tags";
import type { JevGroupMember, JevDuplicateVerdict } from "./jevDuplicate";

export { applyTagMerges, planTagMerges, type TagMerge } from "../tags";

// Pure planning for tag consolidation (see convex/tagConsolidate.ts).
// Tags are plain strings on memories, so a merge retags every memory that
// carries a loser to the keeper. Two tiers: a deterministic group is one
// brand whose host-name spellings (`wwwyoutubecom`, `youtubecom`) collapsed to
// different tags; an AI group is a few leftover tags that look alike
// (`machine-learning`, `machinelearning`) and that Jev judges as one tag.

export interface TagConsolidationCounts {
  groupsMerged: number;
  // of groupsMerged, the groups Jev merged
  aiGroupsMerged: number;
  // Jev calls made (0 when AI is off, keyless or over budget)
  aiCalls: number;
  tagsRemoved: number;
  memoriesRetagged: number;
  // rows read; stops at the scan cap
  scannedRows: number;
  truncated: boolean;
}

export function emptyTagConsolidationCounts(): TagConsolidationCounts {
  return {
    groupsMerged: 0,
    aiGroupsMerged: 0,
    aiCalls: 0,
    tagsRemoved: 0,
    memoriesRetagged: 0,
    scannedRows: 0,
    truncated: false,
  };
}

// ---------------------------------------------------------------- AI tier

// hard caps: one run makes at most MAX_TAG_AI_CALLS Jev calls, each on a group
// of at most MAX_AI_GROUP_SIZE tags
export const MAX_TAG_AI_CALLS = 5;
const MAX_AI_GROUP_SIZE = 4;
const MIN_AI_TAG_LENGTH = 4;
const FUZZY_MIN_LENGTH = 6;

export interface TagCount {
  tag: string;
  count: number;
}

// `machine-learning` and `machinelearning` share a key; so do `tool`, `tools`
function looseKey(tag: string): string {
  return tag.replace(/-/g, "").replace(/(?:es|s)$/, "");
}

// true when a and b differ by one inserted, deleted or changed letter
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.slice(i) === long.slice(i + 1);
}

function looksAlike(a: string, b: string): boolean {
  const ka = looseKey(a);
  const kb = looseKey(b);
  if (ka === kb) return true;
  return (
    ka.length >= FUZZY_MIN_LENGTH &&
    kb.length >= FUZZY_MIN_LENGTH &&
    oneEditApart(ka, kb)
  );
}

/**
 * Candidate groups for the AI tier: leftover tags (not in `exclude`) that
 * look alike, as groups of 2 to MAX_AI_GROUP_SIZE tags, busiest first. A tag
 * sits in one group only. Nothing here merges: Jev decides.
 */
export function planTagAiGroups(
  tags: readonly TagCount[],
  exclude: ReadonlySet<string>,
  maxGroups: number = MAX_TAG_AI_CALLS,
): TagCount[][] {
  const pool = tags
    .filter((t) => t.tag.length >= MIN_AI_TAG_LENGTH && !exclude.has(t.tag))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  const used = new Set<string>();
  const groups: TagCount[][] = [];
  for (const seed of pool) {
    if (groups.length >= maxGroups) break;
    if (used.has(seed.tag)) continue;
    const group = [seed];
    for (const other of pool) {
      if (group.length >= MAX_AI_GROUP_SIZE) break;
      if (other === seed || used.has(other.tag)) continue;
      if (looksAlike(seed.tag, other.tag)) group.push(other);
    }
    if (group.length < 2) continue;
    for (const member of group) used.add(member.tag);
    groups.push(group);
  }
  return groups;
}

/** The row Jev reads for one tag: the tag as title, its use as content. */
export function tagJevMember(tag: TagCount): JevGroupMember {
  return {
    id: tag.tag,
    title: tag.tag,
    content: `Tag "${tag.tag}" used on ${String(tag.count)} memories. Same tag, spelled differently, or a different concept?`,
    status: "active",
    createdAt: 0,
  };
}

/** Keeper: most used, then shortest, then alphabetical. */
function pickKeeper(group: readonly TagCount[]): TagCount | undefined {
  return [...group].sort(
    (a, b) =>
      b.count - a.count ||
      a.tag.length - b.tag.length ||
      a.tag.localeCompare(b.tag),
  )[0];
}

/**
 * Turns Jev's verdict into one merge. Only a "flagged" verdict merges, and
 * only tags of the group: the keeper is chosen here (never Jev's pick), the
 * losers are the other tags Jev marked removable. Null otherwise.
 */
export function tagMergeFromVerdict(
  group: readonly TagCount[],
  verdict: JevDuplicateVerdict,
): TagMerge | null {
  if (verdict.status !== "flagged") return null;
  const named = new Set([verdict.keeperId, ...verdict.removeIds]);
  const merged = group.filter((t) => named.has(t.tag));
  const keeper = pickKeeper(merged);
  if (keeper === undefined || merged.length < 2) return null;
  const losers = merged
    .filter((t) => t.tag !== keeper.tag)
    .map((t) => t.tag)
    .sort();
  return { keeper: keeper.tag, losers };
}
