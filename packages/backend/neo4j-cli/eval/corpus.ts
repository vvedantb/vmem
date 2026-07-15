// labelled retrieval benchmark corpus (488 memories, 36 relationships, 84 queries)

import { readFileSync } from "node:fs";
import { z } from "zod";

export type SeedMemoryType = "profile" | "episodic" | "knowledge";
export type SeedMemoryStatus = "active" | "pinned";

export interface SeedMemory {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: SeedMemoryType;
  source: string;
  confidence: number;
  status: SeedMemoryStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt: null;
}

export interface SeedRelationship {
  sourceId: string;
  targetId: string;
  reason: string;
}

export interface RetrievalEvalQuery {
  query: string;
  expectedTitles: string[];
  relevance?: Record<string, number>;
  type?: string;
}

export const BENCH_USER_ID = "user_vmem_bench_eval";
const SOURCE = "bench-corpus";

// tunable scale knobs
const MULTI_HOP_COUNT = 12;
const PROJECT_COUNT = 8;
const TEMPORAL_COUNT = 12;
const FILLER_COUNT = 350;

interface MemSpec {
  key: string;
  title: string;
  content: string;
  type?: SeedMemoryType;
  tags?: string[];
  ageDays?: number;
  status?: SeedMemoryStatus;
  confidence?: number;
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
}
interface Scenario {
  memories: MemSpec[];
  relationships?: RelSpec[];
  queries: QuerySpec[];
}

const factRow = z.object({
  title: z.string(),
  content: z.string(),
  query: z.string(),
});

const corpusStaticSchema = z.object({
  codenames: z.array(z.string()).min(1),
  people: z.array(z.string()).min(1),
  teams: z.array(z.string()).min(1),
  temporalTopics: z
    .array(
      z.object({
        topic: z.string(),
        stale: z.string(),
        current: z.string(),
      }),
    )
    .min(1),
  singleFacts: z.array(factRow).min(1),
  preferences: z.array(factRow).min(1),
  traps: z
    .array(
      z.object({
        goldTitle: z.string(),
        goldContent: z.string(),
        trapTitle: z.string(),
        trapContent: z.string(),
        query: z.string(),
      }),
    )
    .min(1),
  errorCodes: z
    .array(z.object({ code: z.string(), meaning: z.string() }))
    .min(1),
  abstentions: z.array(z.string()).min(1),
  fillerTopics: z.array(z.string()).min(1),
});

// JSON.parse is typed `any` — re-enter as unknown for zod
// oxlint-disable-next-line typescript/no-unsafe-assignment -- JSON.parse
const corpusStaticRaw: unknown = JSON.parse(
  readFileSync(new URL("./corpus-static.json", import.meta.url), "utf8"),
);
const CORPUS_STATIC = corpusStaticSchema.parse(corpusStaticRaw);

const {
  codenames: CODENAMES,
  people: PEOPLE,
  teams: TEAMS,
  temporalTopics: TEMPORAL_TOPICS,
  singleFacts: SINGLE_FACTS,
  preferences: PREFERENCES,
  traps: TRAPS,
  errorCodes: ERROR_CODES,
  abstentions: ABSTENTIONS,
  fillerTopics: FILLER_TOPICS,
} = CORPUS_STATIC;

function code(i: number): string {
  return CODENAMES[i % CODENAMES.length] ?? `Code${String(i)}`;
}
function person(i: number): string {
  return PEOPLE[i % PEOPLE.length] ?? `Person${String(i)}`;
}
function team(i: number): string {
  return TEAMS[i % TEAMS.length] ?? `team${String(i)}`;
}

const MULTI_HOP_SHAPES: Array<
  (
    c: string,
    t: string,
    p1: string,
    p2: string,
  ) => {
    query: string;
    bridgeTitle: string;
    bridgeContent: string;
    goldTitle: string;
    goldContent: string;
  }
> = [
  (c, t, p1, p2) => ({
    query: `who leads the team behind ${c}`,
    bridgeTitle: `${c} is built and run by the ${t} team`,
    bridgeContent: `${c} is built and operated end to end by the ${t} team.`,
    goldTitle: `${p1} and ${p2} lead the ${t} team`,
    goldContent: `${p1} and ${p2} jointly lead the ${t} team this year.`,
  }),
  (c, t, p1) => ({
    query: `who responded to the ${c} incident`,
    bridgeTitle: `the ${c} incident was escalated to the ${t} on-call`,
    bridgeContent: `When ${c} went down the incident was escalated to the ${t} on-call rota.`,
    goldTitle: `${p1} covers ${t} on-call and responds to incidents`,
    goldContent: `${p1} carries the pager for the ${t} rota and responds to incidents first.`,
  }),
  (c, t, p1) => ({
    query: `who approved the ${c} rollout`,
    bridgeTitle: `the ${c} rollout was reviewed by the ${t} board`,
    bridgeContent: `The ${c} rollout went through a sign-off at the ${t} board.`,
    goldTitle: `${p1} chairs the ${t} board and approves rollouts`,
    goldContent: `${p1} chairs the ${t} board, the body that approves rollouts.`,
  }),
  (c, t, p1) => ({
    query: `who owns the budget for ${c}`,
    bridgeTitle: `${c} is funded from the ${t} cost centre`,
    bridgeContent: `${c} draws its funding from the ${t} cost centre.`,
    goldTitle: `${p1} manages the ${t} budget`,
    goldContent: `${p1} is accountable for the ${t} budget and its spend.`,
  }),
  (c, t, p1) => ({
    query: `who sets the roadmap for ${c}`,
    bridgeTitle: `the ${c} roadmap is planned by the ${t} group`,
    bridgeContent: `Planning for the ${c} roadmap sits with the ${t} group.`,
    goldTitle: `${p1} owns roadmap planning for the ${t} group`,
    goldContent: `${p1} runs roadmap planning across the ${t} group.`,
  }),
  (c, t, p1) => ({
    query: `who supports customers using ${c}`,
    bridgeTitle: `${c} customer issues route to the ${t} desk`,
    bridgeContent: `Customer tickets about ${c} are routed to the ${t} support desk.`,
    goldTitle: `${p1} runs the ${t} support desk`,
    goldContent: `${p1} manages the ${t} support desk and its queue.`,
  }),
];

function multiHop(i: number): Scenario {
  const shape = MULTI_HOP_SHAPES[i % MULTI_HOP_SHAPES.length];
  if (shape === undefined) {
    throw new Error(`missing multi-hop shape for index ${String(i)}`);
  }
  const c = code(i);
  const t = team(i);
  const p1 = person(2 * i);
  const p2 = person(2 * i + 1);
  const s = shape(c, t, p1, p2);
  const bridgeKey = `mh${String(i)}_bridge`;
  const goldKey = `mh${String(i)}_gold`;
  return {
    memories: [
      {
        key: bridgeKey,
        title: s.bridgeTitle,
        content: s.bridgeContent,
        type: "knowledge",
        tags: ["ownership", c.toLowerCase()],
      },
      {
        key: goldKey,
        title: s.goldTitle,
        content: s.goldContent,
        type: "knowledge",
        tags: ["people", t],
      },
    ],
    relationships: [
      {
        from: bridgeKey,
        to: goldKey,
        reason: `${t} team owns ${c}`,
      },
    ],
    queries: [
      {
        query: s.query,
        type: "multi-hop",
        relevance: { [goldKey]: 3, [bridgeKey]: 1 },
      },
    ],
  };
}

function projectCluster(i: number): Scenario {
  const c = code(MULTI_HOP_COUNT + i);
  const t = team(i + 3);
  const anchorKey = `pj${String(i)}_anchor`;
  const facts = [
    {
      key: `pj${String(i)}_s1`,
      title: `The ${t} team stores data in a managed column store`,
      content: `For this initiative the ${t} team chose a managed column store for fast aggregate reads.`,
    },
    {
      key: `pj${String(i)}_s2`,
      title: `The ${t} team gates rollout behind a feature flag`,
      content: `The ${t} team ships gradually behind a percentage feature flag with automatic rollback.`,
    },
    {
      key: `pj${String(i)}_s3`,
      title: `The ${t} team runs on-call for the first year`,
      content: `The ${t} team owns delivery and on-call for the first year after launch.`,
    },
  ];
  return {
    memories: [
      {
        key: anchorKey,
        title: `${c} project overview`,
        content: `The ${c} project is a major initiative this year, spanning several quarters.`,
        type: "knowledge",
        tags: ["project", c.toLowerCase()],
      },
      ...facts.map(
        (f, idx): MemSpec => ({
          key: f.key,
          title: f.title,
          content: f.content,
          type: "knowledge",
          tags: ["project-detail"],
          ageDays: 40 + idx,
        }),
      ),
    ],
    relationships: facts.map((f) => ({
      from: anchorKey,
      to: f.key,
      reason: `detail of ${c}`,
    })),
    queries: [
      {
        query: `what do we know about the ${c} project`,
        type: "project",
        relevance: {
          [anchorKey]: 3,
          ...Object.fromEntries(facts.map((f) => [f.key, 2])),
        },
      },
    ],
  };
}

function temporalUpdate(i: number): Scenario {
  const spec = TEMPORAL_TOPICS[i % TEMPORAL_TOPICS.length];
  if (spec === undefined) {
    throw new Error(`missing temporal topic for index ${String(i)}`);
  }
  const staleKey = `tu${String(i)}_stale`;
  const currentKey = `tu${String(i)}_current`;
  return {
    memories: [
      {
        key: staleKey,
        title: `${spec.topic} was ${spec.stale}`,
        content: `Historically, ${spec.topic} was ${spec.stale}.`,
        type: "knowledge",
        tags: ["config"],
        ageDays: 180 + i * 5,
      },
      {
        key: currentKey,
        title: `${spec.topic} is now ${spec.current}`,
        content: `As of recently, ${spec.topic} is ${spec.current}; ${spec.stale} is deprecated.`,
        type: "knowledge",
        tags: ["config"],
        ageDays: 3 + i,
      },
    ],
    queries: [
      {
        query: `what is ${spec.topic} currently`,
        type: "update",
        relevance: {
          [currentKey]: 3,
          [staleKey]: 1,
        },
      },
    ],
  };
}

function exactMatchScenario(): Scenario {
  return {
    memories: ERROR_CODES.map(
      (e): MemSpec => ({
        key: `ex_${e.code}`,
        title: `Error ${e.code} means ${e.meaning}`,
        content: `When the service returns ${e.code}, it indicates that ${e.meaning}.`,
        type: "knowledge",
        tags: ["error-code"],
      }),
    ),
    queries: ERROR_CODES.map((e) => ({
      query: `what does error ${e.code} mean`,
      type: "exact-match",
      relevance: { [`ex_${e.code}`]: 3 },
    })),
  };
}

function fillerMemories(count: number): MemSpec[] {
  const out: MemSpec[] = [];
  for (let i = 0; i < count; i++) {
    const base = FILLER_TOPICS[i % FILLER_TOPICS.length] ?? "Misc note";
    out.push({
      key: `filler_${String(i)}`,
      title: `${base} (#${String(i)})`,
      content: `${base}. A routine personal note, entry ${String(i)}, unrelated to the project work.`,
      type: i % 3 === 0 ? "episodic" : "knowledge",
      tags: ["misc"],
      ageDays: 30 + (i % 300),
    });
  }
  return out;
}

function singleAnswerScenario(
  key: string,
  queryType: string,
  memoryType: SeedMemoryType,
  tags: string[],
  title: string,
  content: string,
  query: string,
): Scenario {
  return {
    memories: [{ key, title, content, type: memoryType, tags }],
    queries: [{ query, type: queryType, relevance: { [key]: 3 } }],
  };
}

const SCENARIOS: Scenario[] = [
  ...Array.from({ length: MULTI_HOP_COUNT }, (_, i) => multiHop(i)),
  ...Array.from({ length: PROJECT_COUNT }, (_, i) => projectCluster(i)),
  ...Array.from({ length: TEMPORAL_COUNT }, (_, i) => temporalUpdate(i)),
  ...SINGLE_FACTS.map((f, i) =>
    singleAnswerScenario(
      `sf${String(i)}`,
      "single-fact",
      "knowledge",
      ["fact"],
      f.title,
      f.content,
      f.query,
    ),
  ),
  ...PREFERENCES.map((p, i) =>
    singleAnswerScenario(
      `pref${String(i)}`,
      "preference",
      "profile",
      ["preferences"],
      p.title,
      p.content,
      p.query,
    ),
  ),
  ...TRAPS.map((tr, i) => {
    const goldKey = `lt${String(i)}_gold`;
    const trapKey = `lt${String(i)}_trap`;
    return {
      memories: [
        {
          key: goldKey,
          title: tr.goldTitle,
          content: tr.goldContent,
          type: "knowledge" as const,
          tags: ["fact"],
        },
        {
          key: trapKey,
          title: tr.trapTitle,
          content: tr.trapContent,
          type: "episodic" as const,
          tags: ["misc"],
        },
      ],
      queries: [
        {
          query: tr.query,
          type: "lexical-trap",
          relevance: { [goldKey]: 3, [trapKey]: 0 },
        },
      ],
    };
  }),
  exactMatchScenario(),
  {
    memories: [],
    queries: ABSTENTIONS.map((q) => ({
      query: q,
      type: "abstention",
      relevance: {},
    })),
  },
  { memories: fillerMemories(FILLER_COUNT), queries: [] },
];

function isoFromAgeDays(ageDays: number): string {
  return new Date(Date.now() - ageDays * 86_400_000).toISOString();
}

export function generateBenchmarkCorpus(): {
  memories: SeedMemory[];
  relationships: SeedRelationship[];
  queries: RetrievalEvalQuery[];
} {
  const memories: SeedMemory[] = [];
  const relationships: SeedRelationship[] = [];
  const queries: RetrievalEvalQuery[] = [];
  const titleByKey = new Map<string, string>();
  const seenTitles = new Set<string>();

  const addMemory = (spec: MemSpec): void => {
    if (titleByKey.has(spec.key)) return;
    if (seenTitles.has(spec.title)) {
      throw new Error(`duplicate benchmark title: ${spec.title}`);
    }
    seenTitles.add(spec.title);
    titleByKey.set(spec.key, spec.title);
    const ageDays = spec.ageDays ?? 60;
    const createdAt = isoFromAgeDays(ageDays);
    memories.push({
      id: `bench_${spec.key}`,
      userId: BENCH_USER_ID,
      title: spec.title,
      content: spec.content,
      type: spec.type ?? "knowledge",
      source: SOURCE,
      confidence: spec.confidence ?? 0.85,
      status: spec.status ?? "active",
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
        sourceId: `bench_${rel.from}`,
        targetId: `bench_${rel.to}`,
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
            `query "${q.query}" references unknown memory ${key}`,
          );
        }
        relevance[title] = grade;
        if (grade > 0) expectedTitles.push(title);
      }
      queries.push({ query: q.query, type: q.type, expectedTitles, relevance });
    }
  }

  return { memories, relationships, queries };
}
