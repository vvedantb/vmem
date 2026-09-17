import type { MemoryType } from "@vmem/sdk";
import type {
  BenchmarkCorpus,
  BenchmarkMemory,
  RetrievalEvalQuery,
} from "./corpus";
import { BENCH_USER_ID } from "./corpus";

export const TAIL_CORPUS_SIZE = 2000;
export const TAIL_GOLD_INDEX = 500;
export const TAIL_OCCUPIER_COUNT = 60;
export const TAIL_QUERY = "amberhelix passphrase";
export const TAIL_GOLD_TITLE = "Amberhelix passphrase";

const SOURCE = "tail-bench-corpus";
const GOLD_ID = "tail_gold";

function isoFromAgeDays(ageDays: number): string {
  return new Date(Date.now() - ageDays * 86_400_000).toISOString();
}

function memory(args: {
  id: string;
  title: string;
  content: string;
  ageDays: number;
  tags?: string[];
  type?: MemoryType;
}): BenchmarkMemory {
  const createdAt = isoFromAgeDays(args.ageDays);
  return {
    id: args.id,
    userId: BENCH_USER_ID,
    title: args.title,
    content: args.content,
    type: args.type ?? "knowledge",
    source: SOURCE,
    confidence: 0.9,
    status: "active",
    tags: args.tags ?? [],
    createdAt,
    updatedAt: createdAt,
    expiresAt: null,
  };
}

function occupierContent(i: number): string {
  return `amberhelix extra passphrase extra amberhelix padding ${String(i)}`;
}

export interface TailCorpus extends BenchmarkCorpus {
  goldId: string;
  occupierIds: string[];
  query: RetrievalEvalQuery;
}

export function generateTailCorpus(): TailCorpus {
  const occupierIds: string[] = [];
  const memories: BenchmarkMemory[] = [];

  for (let i = 0; i < TAIL_CORPUS_SIZE; i += 1) {
    if (i === TAIL_GOLD_INDEX) {
      memories.push(
        memory({
          id: GOLD_ID,
          title: TAIL_GOLD_TITLE,
          content: "The vault code is NX-991-ORBIT.",
          ageDays: i,
          tags: ["vault"],
        }),
      );
      continue;
    }
    if (i >= 800 && occupierIds.length < TAIL_OCCUPIER_COUNT) {
      const id = `tail_occ_${String(occupierIds.length)}`;
      occupierIds.push(id);
      memories.push(
        memory({
          id,
          title: `Padding notes ${String(occupierIds.length)}`,
          content: occupierContent(occupierIds.length),
          ageDays: i,
          tags: ["misc"],
        }),
      );
      continue;
    }
    memories.push(
      memory({
        id: `tail_noise_${String(i)}`,
        title: `Standup notes ${String(i)}`,
        content: `Lunch weather errands and grocery list entry ${String(i)}.`,
        ageDays: i,
        type: "episodic",
        tags: ["misc"],
      }),
    );
  }

  const query: RetrievalEvalQuery = {
    query: TAIL_QUERY,
    expectedTitles: [TAIL_GOLD_TITLE],
    relevance: { [TAIL_GOLD_TITLE]: 3 },
    type: "tail-gold",
  };

  return {
    memories,
    relationships: [],
    queries: [query],
    goldId: GOLD_ID,
    occupierIds,
    query,
  };
}
