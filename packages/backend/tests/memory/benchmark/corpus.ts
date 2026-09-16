import type { MemoryWithTags } from "@vmem/sdk";

export type BenchKind = "exact" | "synonym" | "paraphrase" | "entity";

export interface BenchQuery {
  id: string;
  query: string;
  relevant: readonly string[];
  kind: BenchKind;
}

function memory(
  id: string,
  title: string,
  content: string,
  tags: string[],
  createdAt: string,
  type: MemoryWithTags["type"] = "knowledge",
): MemoryWithTags {
  return {
    id,
    userId: "bench_user",
    profileId: "bench_profile",
    title,
    content,
    type,
    source: "bench",
    sourceType: "bench",
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: 0.92,
    status: "active",
    createdAt,
    updatedAt: createdAt,
    expiresAt: null,
    tags,
  };
}

export const SYNTHETIC_CORPUS: MemoryWithTags[] = [
  memory(
    "mem_pnpm",
    "Prefers pnpm",
    "Use pnpm for vmem installs and workspaces.",
    ["tooling"],
    "2026-08-01T00:00:00.000Z",
  ),
  memory(
    "mem_yarn_old",
    "Used yarn at previous job",
    "The old company installed JavaScript packages with yarn.",
    ["tooling"],
    "2024-01-01T00:00:00.000Z",
  ),
  memory(
    "mem_helix",
    "Prefers Helix",
    "Switched from Neovim to Helix as the daily code editor.",
    ["editor"],
    "2026-07-01T00:00:00.000Z",
  ),
  memory(
    "mem_dark",
    "Dark mode everywhere",
    "Uses a dark color scheme in every editor and the dashboard.",
    ["preferences"],
    "2026-06-01T00:00:00.000Z",
  ),
  memory(
    "mem_coffee",
    "Coffee order",
    "Oat latte, no sugar.",
    ["food"],
    "2026-05-01T00:00:00.000Z",
  ),
  memory(
    "mem_convex",
    "Uses Convex",
    "All memory state is stored in Convex, not a graph database.",
    ["backend"],
    "2026-08-15T00:00:00.000Z",
  ),
  memory(
    "mem_typescript",
    "Prefers TypeScript",
    "Strict TypeScript in the monorepo.",
    ["language"],
    "2026-04-01T00:00:00.000Z",
  ),
  memory(
    "mem_london",
    "Lives in London",
    "Based in London, UK.",
    ["profile"],
    "2026-03-01T00:00:00.000Z",
    "profile",
  ),
  memory(
    "mem_alice",
    "Met Alice",
    "Coffee with Alice on Tuesday to talk through the roadmap.",
    ["people"],
    "2026-08-10T00:00:00.000Z",
    "episodic",
  ),
  memory(
    "mem_health",
    "Morning 5k",
    "Runs a 5k three times a week.",
    ["health"],
    "2026-02-01T00:00:00.000Z",
  ),
  memory(
    "mem_dog",
    "Has a dog named Maple",
    "Golden retriever Maple sleeps under the desk.",
    ["pets"],
    "2026-01-15T00:00:00.000Z",
    "profile",
  ),
  memory(
    "mem_react",
    "Builds React apps",
    "Frontend work is React with Vite.",
    ["frontend"],
    "2026-07-20T00:00:00.000Z",
  ),
];

export const SYNTHETIC_QUERIES: BenchQuery[] = [
  {
    id: "exact_pnpm",
    query: "pnpm",
    relevant: ["mem_pnpm"],
    kind: "exact",
  },
  {
    id: "exact_helix_title",
    query: "Prefers Helix",
    relevant: ["mem_helix"],
    kind: "exact",
  },
  {
    id: "exact_convex",
    query: "Convex",
    relevant: ["mem_convex"],
    kind: "exact",
  },
  {
    id: "syn_package_manager",
    query: "package manager",
    relevant: ["mem_pnpm", "mem_yarn_old"],
    kind: "synonym",
  },
  {
    id: "syn_text_editor",
    query: "text editor",
    relevant: ["mem_helix"],
    kind: "synonym",
  },
  {
    id: "syn_color_scheme",
    query: "color scheme",
    relevant: ["mem_dark"],
    kind: "synonym",
  },
  {
    id: "syn_oat_drink",
    query: "oat milk drink",
    relevant: ["mem_coffee"],
    kind: "synonym",
  },
  {
    id: "para_editor_like",
    query: "what editor does the user like",
    relevant: ["mem_helix"],
    kind: "paraphrase",
  },
  {
    id: "para_js_install",
    query: "how are javascript packages installed",
    relevant: ["mem_pnpm", "mem_yarn_old"],
    kind: "paraphrase",
  },
  {
    id: "para_theme",
    query: "preferred color scheme",
    relevant: ["mem_dark"],
    kind: "paraphrase",
  },
  {
    id: "para_city",
    query: "where does the user live",
    relevant: ["mem_london"],
    kind: "paraphrase",
  },
  {
    id: "entity_maple",
    query: "Maple",
    relevant: ["mem_dog"],
    kind: "entity",
  },
  {
    id: "entity_alice",
    query: "Alice",
    relevant: ["mem_alice"],
    kind: "entity",
  },
];

export const HARD_CASES: Array<{ id: string; query: string; note: string }> = [
  {
    id: "hard_multihop",
    query: "city of the person who likes maple syrup",
    note: "Needs multi-hop / commonsense; Maple is a dog, not syrup.",
  },
  {
    id: "hard_abstract",
    query: "caffeinated morning beverage without naming coffee or oat",
    note: "True paraphrase with no lexical overlap after expansion.",
  },
  {
    id: "hard_language",
    query: "éditeur de texte préféré",
    note: "Cross-lingual; Convex FTS tokenizer is English-oriented.",
  },
];
