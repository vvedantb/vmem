import { legacyDomainTag } from "../tags";

// Pure planning for tag consolidation (see convex/tagConsolidate.ts).
// Tags are plain strings on memories, so a merge retags every memory that
// carries a loser to the keeper. Deterministic only: a group is one brand
// whose host-name spellings (`wwwyoutubecom`, `youtubecom`) collapsed to
// different tags.

export interface TagMerge {
  keeper: string;
  losers: string[];
}

export interface TagConsolidationCounts {
  groupsMerged: number;
  tagsRemoved: number;
  memoriesRetagged: number;
  // rows read; stops at the scan cap
  scannedRows: number;
  truncated: boolean;
}

export function emptyTagConsolidationCounts(): TagConsolidationCounts {
  return {
    groupsMerged: 0,
    tagsRemoved: 0,
    memoriesRetagged: 0,
    scannedRows: 0,
    truncated: false,
  };
}

/**
 * Groups tags by brand. The keeper is the brand itself (`youtube`), even if
 * no memory carries it yet. A group merges when it has a www-prefixed tag,
 * or when a plain `brandcom` tag sits next to the brand tag. Running the
 * plan on the merged result returns no groups.
 */
export function planTagMerges(tags: Iterable<string>): TagMerge[] {
  const present = new Set(tags);
  const byBrand = new Map<string, { strong: string[]; weak: string[] }>();
  for (const tag of present) {
    const legacy = legacyDomainTag(tag);
    if (!legacy) continue;
    const entry = byBrand.get(legacy.brand) ?? { strong: [], weak: [] };
    entry[legacy.strong ? "strong" : "weak"].push(tag);
    byBrand.set(legacy.brand, entry);
  }
  const merges: TagMerge[] = [];
  for (const [brand, { strong, weak }] of byBrand) {
    // a keeper that would merge again next run breaks idempotence
    if (legacyDomainTag(brand) !== null) continue;
    const mergeWeak = strong.length > 0 || present.has(brand);
    const losers = [...strong, ...(mergeWeak ? weak : [])]
      .filter((tag) => tag !== brand)
      .sort();
    if (losers.length > 0) merges.push({ keeper: brand, losers });
  }
  return merges.sort((a, b) => a.keeper.localeCompare(b.keeper));
}

/** Replaces losers with keepers, keeps order and drops repeats. */
export function applyTagMerges(
  tags: readonly string[],
  merges: readonly TagMerge[],
): string[] {
  const keeperOf = new Map(
    merges.flatMap((merge) =>
      merge.losers.map((loser): [string, string] => [loser, merge.keeper]),
    ),
  );
  return [...new Set(tags.map((tag) => keeperOf.get(tag) ?? tag))];
}
