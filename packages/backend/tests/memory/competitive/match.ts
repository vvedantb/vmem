import { z } from "zod";
import type { BenchmarkMemory } from "../../../eval/corpus";

const vmemMetaSchema = z
  .object({
    vmem_title: z.string().optional(),
    vmem_id: z.string().optional(),
  })
  .passthrough();

export interface VendorHit {
  text: string;
  metadata?: unknown;
  customId?: string;
}

function metaFields(metadata: unknown): {
  title: string | undefined;
  id: string | undefined;
} {
  const parsed = vmemMetaSchema.safeParse(metadata);
  if (!parsed.success) {
    return { title: undefined, id: undefined };
  }
  const title = parsed.data.vmem_title?.trim();
  const id = parsed.data.vmem_id?.trim();
  return {
    title: title !== undefined && title.length > 0 ? title : undefined,
    id: id !== undefined && id.length > 0 ? id : undefined,
  };
}

function longestContainedTitle(
  text: string,
  titles: readonly string[],
): string | undefined {
  const haystack = text.toLowerCase();
  let best: string | undefined;
  for (const title of titles) {
    if (!haystack.includes(title.toLowerCase())) continue;
    if (best === undefined || title.length > best.length) {
      best = title;
    }
  }
  return best;
}

export function matchVendorHits(
  hits: readonly VendorHit[],
  memories: readonly BenchmarkMemory[],
): string[] {
  const byId = new Map(memories.map((memory) => [memory.id, memory.title]));
  const titleSet = new Set(memories.map((memory) => memory.title));
  const titles = [...titleSet].sort((a, b) => b.length - a.length);
  const ranked: string[] = [];
  const seen = new Set<string>();
  const push = (title: string | undefined): void => {
    if (title === undefined || !titleSet.has(title) || seen.has(title)) return;
    seen.add(title);
    ranked.push(title);
  };
  for (const hit of hits) {
    const meta = metaFields(hit.metadata);
    if (meta.title !== undefined && titleSet.has(meta.title)) {
      push(meta.title);
      continue;
    }
    const id = meta.id ?? hit.customId;
    if (id !== undefined) {
      const mapped = byId.get(id);
      if (mapped !== undefined) {
        push(mapped);
        continue;
      }
    }
    push(longestContainedTitle(hit.text, titles));
  }
  return ranked;
}
