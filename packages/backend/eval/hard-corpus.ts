// Harder labelled retrieval set: paraphrase, long-tail entities, 2-hop links,
// tag+type filters, and keyword-stuffed distractors. Separate from the Neo4j
// comparison corpus so that bar stays frozen.

import type { MemoryType } from "@vmem/sdk";
import type {
  BenchmarkCorpus,
  BenchmarkMemory,
  BenchmarkRelationship,
  RetrievalEvalFilter,
  RetrievalEvalQuery,
} from "./corpus";
import { BENCH_USER_ID } from "./corpus";

const SOURCE = "hard-bench-corpus";
const FILLER_COUNT = 280;

interface MemSpec {
  key: string;
  title: string;
  content: string;
  type?: MemoryType;
  tags?: string[];
  ageDays?: number;
}

interface RelSpec {
  from: string;
  to: string;
  reason: string;
}

interface QuerySpec {
  query: string;
  type: string;
  relevance: Record<string, number>;
  filter?: RetrievalEvalFilter;
}

interface Scenario {
  memories: MemSpec[];
  relationships?: RelSpec[];
  queries: QuerySpec[];
}

const TWO_HOP: Array<{
  code: string;
  store: string;
  team: string;
  person: string;
}> = [
  { code: "Quasar", store: "Aurora", team: "storage", person: "Asha" },
  { code: "Nimbus", store: "Bigtable", team: "platform", person: "Benno" },
  { code: "Faraday", store: "Spanner", team: "data", person: "Celine" },
  { code: "Kepler", store: "Redis", team: "cache", person: "Dario" },
  { code: "Zenith", store: "ClickHouse", team: "analytics", person: "Elena" },
  { code: "Pulsar", store: "S3", team: "infra", person: "Farid" },
];

function twoHop(row: (typeof TWO_HOP)[number], i: number): Scenario {
  const seedKey = `h2_${String(i)}_seed`;
  const midKey = `h2_${String(i)}_mid`;
  const goldKey = `h2_${String(i)}_gold`;
  return {
    memories: [
      {
        key: seedKey,
        title: `${row.code} persists into ${row.store}`,
        content: `${row.code} writes durable state into ${row.store} every night.`,
        tags: ["storage", row.code.toLowerCase()],
        ageDays: 40 + i,
      },
      {
        key: midKey,
        title: `${row.store} paging is owned by the ${row.team} team`,
        content: `When ${row.store} pages, the ${row.team} rota is the escalation path.`,
        tags: ["oncall", row.team],
        ageDays: 35 + i,
      },
      {
        key: goldKey,
        title: `${row.person} is first responder for the rota`,
        content: `${row.person} acknowledges that rota before anyone else on the shift.`,
        tags: ["people"],
        ageDays: 20 + i,
      },
    ],
    relationships: [
      {
        from: seedKey,
        to: midKey,
        reason: `${row.code} stored in ${row.store}`,
      },
      {
        from: midKey,
        to: goldKey,
        reason: `${row.team} on-call for ${row.store}`,
      },
    ],
    queries: [
      {
        query: `who pages when ${row.code} storage fails`,
        type: "multi-hop-2",
        relevance: { [goldKey]: 3, [midKey]: 1, [seedKey]: 1 },
      },
    ],
  };
}

function paraphraseScenarios(): Scenario[] {
  const rows: Array<{
    key: string;
    title: string;
    content: string;
    query: string;
    tags: string[];
    type?: MemoryType;
  }> = [
    {
      key: "hp_thesis",
      title: "Dissertation filing cut-off is 15 December",
      content:
        "Committee rules require the dissertation to be filed by 15 December.",
      query: "when must the thesis be turned in",
      tags: ["academic"],
    },
    {
      key: "hp_oat",
      title: "Takes coffee with oat milk",
      content: "Morning espresso is always cut with oat milk, never dairy.",
      query: "what dairy-free white splash goes in the morning cup",
      tags: ["preferences"],
      type: "profile",
    },
    {
      key: "hp_indent",
      title: "Prefers tabs over spaces",
      content: "Indents code with tabs, not spaces.",
      query: "what indent character do I use in source files",
      tags: ["preferences"],
      type: "profile",
    },
    {
      key: "hp_kindle",
      title: "Prefers reading on a Kindle over paper",
      content: "Reads books on a Kindle rather than print.",
      query: "do I rather use an e-reader than print books",
      tags: ["preferences"],
      type: "profile",
    },
    {
      key: "hp_window",
      title: "Prefers window seats when flying",
      content: "Always books a window seat on flights.",
      query: "which side of the plane do I sit on",
      tags: ["preferences"],
      type: "profile",
    },
    {
      key: "hp_standup",
      title: "Prefers async standups over live ones",
      content: "Would rather post a written standup than attend a live call.",
      query: "do I want a written status instead of a meeting",
      tags: ["preferences"],
      type: "profile",
    },
    {
      key: "hp_net30",
      title: "Invoices are due net 30",
      content: "Customer invoices are payable on net-30 terms.",
      query: "how many days do clients have to settle bills",
      tags: ["billing"],
    },
    {
      key: "hp_argon",
      title: "Stored credentials use Argon2id",
      content:
        "Password hashes for stored credentials are Argon2id; bcrypt is gone.",
      query: "what algorithm currently protects stored credentials",
      tags: ["security"],
    },
    {
      key: "hp_figma",
      title: "The design tool of record is Figma",
      content: "All product design work happens in Figma.",
      query: "where do we draw product mockups",
      tags: ["design"],
    },
    {
      key: "hp_ios",
      title: "The mobile app minimum iOS version is 16",
      content: "The mobile app supports iOS 16 and above only.",
      query: "oldest iphone OS the app still supports",
      tags: ["mobile"],
    },
    {
      key: "hp_sla",
      title: "Support SLA is a four hour first response",
      content:
        "Customer support commits to a first response within four hours.",
      query: "how quickly must we reply to a customer ticket",
      tags: ["support"],
    },
    {
      key: "hp_uuid",
      title: "The primary key is a UUID v7",
      content:
        "Records use a UUID version 7 as their primary key for time ordering.",
      query: "what identifier type do new rows use",
      tags: ["schema"],
    },
  ];
  return rows.map((row) => ({
    memories: [
      {
        key: row.key,
        title: row.title,
        content: row.content,
        type: row.type ?? "knowledge",
        tags: row.tags,
        ageDays: 50,
      },
    ],
    queries: [
      {
        query: row.query,
        type: "paraphrase",
        relevance: { [row.key]: 3 },
      },
    ],
  }));
}

function longTailScenarios(): Scenario[] {
  return [
    {
      memories: [
        {
          key: "lt_helios",
          title: "Asha is DRI for Helios",
          content: "Asha owns Helios end to end, including incidents.",
          tags: ["helios", "people"],
        },
        {
          key: "lt_heliosrun",
          title: "Benno is DRI for HeliosRun",
          content: "HeliosRun is a separate batch pipeline. Benno owns it.",
          tags: ["heliosrun", "people"],
        },
        {
          key: "lt_helius",
          title: "Celine owns Helius",
          content: "Helius is an experimental fork. Celine is accountable.",
          tags: ["helius", "people"],
        },
        {
          key: "lt_staging",
          title: "Rico carries the HeliosStaging pager",
          content: "HeliosStaging pages Rico overnight.",
          tags: ["helios-staging", "people"],
        },
      ],
      queries: [
        {
          query: "who is DRI for Helios",
          type: "long-tail",
          relevance: {
            lt_helios: 3,
            lt_heliosrun: 0,
            lt_helius: 0,
            lt_staging: 0,
          },
        },
        {
          query: "HeliosOncall owner",
          type: "long-tail",
          relevance: { lt_helios: 3 },
        },
      ],
    },
    {
      memories: [
        {
          key: "lt_err_a",
          title: "K8S-ERR-9f3a means the kubelet disk pressure fired",
          content:
            "When the cluster returns K8S-ERR-9f3a, kubelet disk pressure is firing.",
          tags: ["error-code"],
        },
        {
          key: "lt_err_b",
          title: "K8S-ERR-9f3b means the scheduler skipped a pod",
          content:
            "When the cluster returns K8S-ERR-9f3b, the scheduler skipped a pod.",
          tags: ["error-code"],
        },
        {
          key: "lt_err_c",
          title: "K8S-ERR-9e3a means the CNI handshake failed",
          content:
            "When the cluster returns K8S-ERR-9e3a, the CNI handshake failed.",
          tags: ["error-code"],
        },
      ],
      queries: [
        {
          query: "what does K8S-ERR-9f3a mean",
          type: "long-tail",
          relevance: { lt_err_a: 3, lt_err_b: 0, lt_err_c: 0 },
        },
      ],
    },
    {
      memories: [
        {
          key: "lt_s2",
          title: "S2Nexus is the catalog source of truth",
          content:
            "Product records resolve through S2Nexus, not the legacy registry.",
          tags: ["s2nexus"],
        },
        {
          key: "lt_s2next",
          title: "S2Next is a deprecated preview channel",
          content:
            "S2Next was a preview and must not be used for catalog reads.",
          tags: ["s2next"],
        },
        {
          key: "lt_s2_space",
          title: "S2 Nexus meetup notes from Berlin",
          content:
            "Notes from a community Nexus meetup; unrelated to the catalog.",
          tags: ["misc"],
          type: "episodic",
        },
      ],
      queries: [
        {
          query: "where is the catalog source of truth",
          type: "long-tail",
          relevance: { lt_s2: 3, lt_s2next: 0, lt_s2_space: 0 },
        },
        {
          query: "S2Nexus",
          type: "long-tail",
          relevance: { lt_s2: 3 },
        },
      ],
    },
  ];
}

function tagConflictScenarios(): Scenario[] {
  return [
    {
      memories: [
        {
          key: "tc_pay_prod",
          title: "Card capture deadline",
          content:
            "The live payments timeout aborts an auth after two seconds.",
          tags: ["payments", "production"],
          ageDays: 90,
        },
        {
          key: "tc_pay_stage",
          title: "Payments timeout tuned last night",
          content: "Timeout for payments is thirty seconds.",
          tags: ["payments", "staging"],
          ageDays: 1,
        },
      ],
      queries: [
        {
          query: "production payments timeout",
          type: "tag-conflict",
          relevance: { tc_pay_prod: 3, tc_pay_stage: 0 },
        },
        {
          query: "payments timeout",
          type: "tag-filter",
          filter: { tags: ["production"] },
          relevance: { tc_pay_prod: 3 },
        },
      ],
    },
    {
      memories: [
        {
          key: "tc_search_prod",
          title: "Cluster replica count",
          content: "Search production keeps three replicas per shard.",
          tags: ["search", "production"],
          ageDays: 70,
        },
        {
          key: "tc_search_stage",
          title: "Search replicas were scaled this morning",
          content: "Search staging now runs one replica to save cost.",
          tags: ["search", "staging"],
          ageDays: 0.2,
        },
      ],
      queries: [
        {
          query: "how many search replicas run in production",
          type: "tag-conflict",
          relevance: { tc_search_prod: 3, tc_search_stage: 0 },
        },
        {
          query: "search replicas",
          type: "tag-filter",
          filter: { tags: ["production", "search"] },
          relevance: { tc_search_prod: 3 },
        },
      ],
    },
    {
      memories: [
        {
          key: "tc_bill_prod",
          title: "Invoice retry budget",
          content: "Billing production retries a failed charge twice.",
          tags: ["billing", "production"],
          ageDays: 40,
        },
        {
          key: "tc_bill_stage",
          title: "Billing retries were raised",
          content: "Billing staging retries a failed charge ten times.",
          tags: ["billing", "staging"],
          ageDays: 2,
        },
      ],
      queries: [
        {
          query: "production billing retry count",
          type: "tag-conflict",
          relevance: { tc_bill_prod: 3, tc_bill_stage: 0 },
        },
      ],
    },
  ];
}

function typeFilterScenarios(): Scenario[] {
  return [
    {
      memories: [
        {
          key: "tf_lisbon_profile",
          title: "Lives in Lisbon",
          content: "Based in Lisbon, Portugal, near the river.",
          type: "profile",
          tags: ["city"],
          ageDays: 200,
        },
        {
          key: "tf_lisbon_office",
          title: "Lisbon office has twelve desks",
          content: "The Lisbon office is a knowledge note about seating.",
          type: "knowledge",
          tags: ["office", "city"],
          ageDays: 10,
        },
        {
          key: "tf_lisbon_trip",
          title: "Flew to Lisbon last May",
          content: "Weekend trip to Lisbon for a conference.",
          type: "episodic",
          tags: ["travel", "city"],
          ageDays: 5,
        },
      ],
      queries: [
        {
          query: "where does the user live",
          type: "type-intent",
          relevance: {
            tf_lisbon_profile: 3,
            tf_lisbon_office: 0,
            tf_lisbon_trip: 0,
          },
        },
        {
          query: "Lisbon",
          type: "type-filter",
          filter: { type: "profile" },
          relevance: { tf_lisbon_profile: 3 },
        },
        {
          query: "Lisbon",
          type: "type-filter",
          filter: { type: "episodic" },
          relevance: { tf_lisbon_trip: 3 },
        },
      ],
    },
    {
      memories: [
        {
          key: "tf_maple_profile",
          title: "Has a dog named Maple",
          content: "Golden retriever Maple sleeps under the desk.",
          type: "profile",
          tags: ["pets"],
        },
        {
          key: "tf_maple_knowledge",
          title: "Maple syrup is the office pancake topping",
          content: "Kitchen knowledge: pancakes get maple syrup, not honey.",
          type: "knowledge",
          tags: ["food"],
        },
        {
          key: "tf_maple_ep",
          title: "Met Maple at the dog park on Tuesday",
          content: "Walked a neighbour's dog named Maple.",
          type: "episodic",
          tags: ["pets"],
        },
      ],
      queries: [
        {
          query: "Maple",
          type: "type-filter",
          filter: { type: "profile", tags: ["pets"] },
          relevance: { tf_maple_profile: 3 },
        },
      ],
    },
  ];
}

function distractorScenarios(): Scenario[] {
  return [
    {
      memories: [
        {
          key: "dx_canary",
          title: "Vault canary is orange-mule-42",
          content:
            "The vault canary token is orange-mule-42 and must stay unique.",
          tags: ["security"],
          ageDays: 80,
        },
        {
          key: "dx_canary_trap",
          title: "Canary bird token from the pet shop",
          content: "Bought a canary; the shop token is in the receipt wallet.",
          tags: ["misc"],
          type: "episodic",
          ageDays: 1,
        },
      ],
      queries: [
        {
          query: "what is the vault canary token",
          type: "distractor",
          relevance: { dx_canary: 3, dx_canary_trap: 0 },
        },
      ],
    },
    {
      memories: [
        {
          key: "dx_fridge",
          title: "Berlin office fridge code is 4821",
          content: "The Berlin kitchen fridge uses code 4821.",
          tags: ["office"],
          ageDays: 120,
        },
        {
          key: "dx_fridge_trap",
          title: "Berlin leftovers in the fridge",
          content: "Put leftover curry in the office fridge yesterday.",
          tags: ["misc"],
          type: "episodic",
          ageDays: 0.5,
        },
      ],
      queries: [
        {
          query: "fridge code in Berlin",
          type: "distractor",
          relevance: { dx_fridge: 3, dx_fridge_trap: 0 },
        },
      ],
    },
    {
      memories: [
        {
          key: "dx_wifi",
          title: "Guest wifi is written on the whiteboard",
          content: "Meeting-room whiteboard holds the guest wifi password.",
          tags: ["office"],
          ageDays: 60,
        },
        {
          key: "dx_wifi_trap",
          title: "Whiteboard markers currently on order",
          content: "The team currently ordered more whiteboard markers.",
          tags: ["misc"],
          ageDays: 1,
        },
      ],
      queries: [
        {
          query: "where is the guest wifi password",
          type: "distractor",
          relevance: { dx_wifi: 3, dx_wifi_trap: 0 },
        },
      ],
    },
    {
      memories: [
        {
          key: "dx_backup",
          title: "Database backups run at 02:00 UTC",
          content: "Nightly database backups start at 02:00 UTC.",
          tags: ["ops"],
          ageDays: 45,
        },
        {
          key: "dx_backup_trap",
          title: "Team currently backing up photos from the offsite",
          content: "The team currently copied offsite photos to a backup disk.",
          tags: ["misc"],
          ageDays: 2,
        },
      ],
      queries: [
        {
          query: "when do database backups run",
          type: "distractor",
          relevance: { dx_backup: 3, dx_backup_trap: 0 },
        },
      ],
    },
    {
      memories: [
        {
          key: "dx_sla_ticket",
          title: "PagerDuty service name is vmem-prod-api",
          content:
            "Production paging goes through the vmem-prod-api PagerDuty service.",
          tags: ["oncall"],
          ageDays: 33,
        },
        {
          key: "dx_sla_trap",
          title: "The team currently named the picnic service",
          content: "Picnic planning; the team currently named it service day.",
          tags: ["misc"],
          ageDays: 1,
        },
      ],
      queries: [
        {
          query: "PagerDuty service name for production",
          type: "distractor",
          relevance: { dx_sla_ticket: 3, dx_sla_trap: 0 },
        },
      ],
    },
    {
      memories: [
        {
          key: "dx_pk",
          title: "Shard key for orders is shop_id",
          content:
            "Order rows are sharded by shop_id, never by customer email.",
          tags: ["schema"],
          ageDays: 55,
        },
        {
          key: "dx_pk_trap",
          title: "The team currently ordered more shop keys",
          content:
            "Hardware keys for the shop door; the team currently ordered extras.",
          tags: ["misc"],
          ageDays: 3,
        },
      ],
      queries: [
        {
          query: "what is the shard key for orders",
          type: "distractor",
          relevance: { dx_pk: 3, dx_pk_trap: 0 },
        },
      ],
    },
  ];
}

const FILLER_BASES = [
  "Tried a new ramen place in Shibuya",
  "Booked flights for the Lisbon trip",
  "Replaced the bike chain after 3000km",
  "Finished reading a book on stoicism",
  "Set up a compost bin in the garden",
  "Switched to a standing desk this week",
  "Watered the office plants on Friday",
  "Recipe: roast cauliflower with tahini",
  "Renewed the gym membership for a year",
  "Planted tomatoes and basil in spring",
  "The team currently reviewed picnic snacks",
  "Search replicas in a board-game night recap",
  "Payments timeout during a board-game argument",
  "Production of sourdough currently in the oven",
  "HeliosRun notes from a sci-fi book club",
  "Vault canary sighting in a wildlife documentary",
  "Berlin fridge leftovers from the potluck",
  "Whiteboard markers currently on the desk",
  "Database of recipes the team currently shares",
  "PagerDuty of bringing snacks to the office",
];

function fillerMemories(count: number): MemSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const base = FILLER_BASES[i % FILLER_BASES.length] ?? "Misc note";
    return {
      key: `hfiller_${String(i)}`,
      title: `${base} (#${String(i)})`,
      content: `${base}. Routine personal note, entry ${String(i)}, unrelated to labelled gold.`,
      type: i % 3 === 0 ? "episodic" : "knowledge",
      tags: i % 5 === 0 ? ["misc", "staging"] : ["misc"],
      ageDays: 1 + (i % 12 === 0 ? 0.2 : 20 + (i % 240)),
    };
  });
}

const SCENARIOS: Scenario[] = [
  ...TWO_HOP.map((row, i) => twoHop(row, i)),
  ...paraphraseScenarios(),
  ...longTailScenarios(),
  ...tagConflictScenarios(),
  ...typeFilterScenarios(),
  ...distractorScenarios(),
  { memories: fillerMemories(FILLER_COUNT), queries: [] },
];

function isoFromAgeDays(ageDays: number): string {
  return new Date(Date.now() - ageDays * 86_400_000).toISOString();
}

export function generateHardCorpus(): BenchmarkCorpus {
  const memories: BenchmarkMemory[] = [];
  const relationships: BenchmarkRelationship[] = [];
  const queries: RetrievalEvalQuery[] = [];
  const titleByKey = new Map<string, string>();
  const seenTitles = new Set<string>();

  const addMemory = (spec: MemSpec): void => {
    if (titleByKey.has(spec.key)) return;
    if (seenTitles.has(spec.title)) {
      throw new Error(`duplicate hard-benchmark title: ${spec.title}`);
    }
    seenTitles.add(spec.title);
    titleByKey.set(spec.key, spec.title);
    const ageDays = spec.ageDays ?? 60;
    const createdAt = isoFromAgeDays(ageDays);
    memories.push({
      id: `hard_${spec.key}`,
      userId: BENCH_USER_ID,
      title: spec.title,
      content: spec.content,
      type: spec.type ?? "knowledge",
      source: SOURCE,
      confidence: 0.85,
      status: "active",
      tags: spec.tags ?? [],
      createdAt,
      updatedAt: createdAt,
      expiresAt: null,
    });
  };

  for (const scenario of SCENARIOS) {
    for (const mem of scenario.memories) addMemory(mem);
    for (const rel of scenario.relationships ?? []) {
      relationships.push({
        sourceId: `hard_${rel.from}`,
        targetId: `hard_${rel.to}`,
        reason: rel.reason,
      });
    }
    for (const q of scenario.queries) {
      const relevance: Record<string, number> = {};
      const expectedTitles: string[] = [];
      for (const [key, grade] of Object.entries(q.relevance)) {
        const title = titleByKey.get(key);
        if (title === undefined) {
          throw new Error(
            `hard query "${q.query}" references unknown memory ${key}`,
          );
        }
        relevance[title] = grade;
        if (grade > 0) expectedTitles.push(title);
      }
      queries.push({
        query: q.query,
        type: q.type,
        expectedTitles,
        relevance,
        filter: q.filter,
      });
    }
  }

  return { memories, relationships, queries };
}
