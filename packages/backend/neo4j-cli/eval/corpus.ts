/**
 * Discriminating benchmark corpus generator for the internal retrieval eval.
 *
 * Produces a controlled labelled corpus (≈480 memories, ≈74 queries) designed
 * so naive baselines fail where specific hybrid-retrieval legs succeed. Each
 * query type isolates one mechanism:
 *
 *   - multi-hop   — the gold shares NO terms with the query and is NOT a close
 *                   embedding match; it is reachable ONLY by a RELATES_TO edge
 *                   from a bridge memory that the query matches strongly. The
 *                   bridge becomes a top-5 seed → graph expansion surfaces the
 *                   gold. Vector/BM25 miss it entirely.
 *   - project     — same trick, multi-gold: an anchor memory the query matches,
 *                   plus several related facts (graded 2) that never repeat the
 *                   anchor's codename → only graph expansion recalls the cluster.
 *   - lexical-trap— a near-miss distractor repeats the query's keyword in a
 *                   different sense (grade 0) → BM25 ranks it high, hurting BM25
 *                   precision/nDCG; vector disambiguates.
 *   - update      — a stale and a current memory on one topic; the query asks
 *                   for the current value → the recency signal separates them.
 *   - single-fact / preference — easy; all methods should do well (shows full
 *                   hybrid stays strong on Recall@5).
 *   - abstention  — no gold exists; reported via the top-1-score signal.
 *
 * Graph-advantage scenarios use unique codenames (Helios, Vega, …) so the
 * bridge/anchor is the unambiguous strongest match and reliably becomes a seed.
 *
 * Deterministic structure; dates are relative to now (recent vs stale is what
 * the recency leg needs, and the corpus is re-seeded before each run).
 */

import type {
  SeedMemory,
  SeedMemoryType,
  SeedMemoryStatus,
  SeedRelationship,
} from "../seed/types";
import type { RetrievalEvalQuery } from "./queries";

export const BENCH_USER_ID = "user_vmem_bench_eval";
const SOURCE = "bench-corpus";

// Tunable scale knobs.
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
  /** memory key → grade (3 high, 2 medium, 1 marginal). Keys absent = irrelevant. */
  relevance: Record<string, number>;
}
interface Scenario {
  memories: MemSpec[];
  relationships?: RelSpec[];
  queries: QuerySpec[];
}

// ---------------------------------------------------------------------------
// Word banks for the generated graph-advantage scenarios.
// ---------------------------------------------------------------------------

const CODENAMES = [
  "Helios",
  "Vega",
  "Orion",
  "Atlas",
  "Nova",
  "Lyra",
  "Draco",
  "Cygnus",
  "Pollux",
  "Rigel",
  "Mizar",
  "Antares",
  "Polaris",
  "Castor",
  "Vela",
  "Crux",
  "Hydra",
  "Phoenix",
  "Aquila",
  "Corvus",
  "Lupus",
  "Tucana",
  "Carina",
  "Dorado",
];
const PEOPLE = [
  "Dana",
  "Raj",
  "Mia",
  "Leo",
  "Priya",
  "Sam",
  "Ada",
  "Kai",
  "Noor",
  "Finn",
  "Ivy",
  "Omar",
  "Zoe",
  "Theo",
  "Lena",
  "Hugo",
  "Nina",
  "Cole",
  "Esme",
  "Ravi",
  "Tariq",
  "Beth",
  "Yuki",
  "Marco",
];
const TEAMS = [
  "platform",
  "growth",
  "data",
  "mobile",
  "infra",
  "payments",
  "search",
  "identity",
  "billing",
  "analytics",
];

function code(i: number): string {
  return CODENAMES[i % CODENAMES.length] ?? `Code${String(i)}`;
}
function person(i: number): string {
  return PEOPLE[i % PEOPLE.length] ?? `Person${String(i)}`;
}
function team(i: number): string {
  return TEAMS[i % TEAMS.length] ?? `team${String(i)}`;
}

// ---------------------------------------------------------------------------
// Generated builders (templatable patterns).
// ---------------------------------------------------------------------------

/**
 * Multi-hop scenario shapes. Each yields a bridge (matches the query strongly
 * via the unique codename) and a gold whose answer is reachable only through
 * the bridge — but the gold deliberately shares ONE generic word with the query
 * (lead / respond / approve / budget / roadmap / support) so vector places it
 * in the candidate pool (top-40) yet OUTSIDE the top-10. The graph leg's boost
 * (≈10 rank positions) then lifts the correct gold into the top-10. Distinct
 * vocab per shape stops bridges/golds clustering across scenarios.
 */
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

/**
 * Multi-hop: query → bridge (unique codename match → becomes a seed) → gold
 * (faint shared word with the query; lifted into top-10 only by graph boost).
 */
function multiHop(i: number): Scenario {
  const shape = MULTI_HOP_SHAPES[i % MULTI_HOP_SHAPES.length];
  if (shape === undefined) return { memories: [], queries: [] };
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

/**
 * Project cluster: anchor (codename, term match) + related facts that never
 * repeat the codename (graded 2). Only graph expansion recalls the cluster.
 */
function projectCluster(i: number): Scenario {
  const c = code(MULTI_HOP_COUNT + i); // disjoint codename range from multi-hop
  const t = team(i + 3); // distinct team per project (10 teams, 10 projects)
  const anchorKey = `pj${String(i)}_anchor`;
  // Siblings are codename-free (so only the graph edge links them to the query)
  // and unique across projects via the per-project team name.
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

const TEMPORAL_TOPICS = [
  { topic: "password hashing", stale: "bcrypt", current: "Argon2id" },
  { topic: "primary cloud region", stale: "us-east-1", current: "eu-west-1" },
  { topic: "the daily standup time", stale: "9am", current: "10:30am" },
  { topic: "the CI runner", stale: "CircleCI", current: "GitHub Actions" },
  { topic: "the API gateway", stale: "Kong", current: "Envoy" },
  { topic: "the staging database", stale: "MySQL", current: "Postgres" },
  { topic: "the frontend framework", stale: "Vue", current: "React" },
  { topic: "the package manager", stale: "npm", current: "pnpm" },
  { topic: "the metrics backend", stale: "Graphite", current: "Prometheus" },
  { topic: "the deploy target", stale: "EC2", current: "Kubernetes" },
  { topic: "the auth provider", stale: "Auth0", current: "Clerk" },
  { topic: "the log aggregator", stale: "Logstash", current: "Vector" },
];

/** Temporal/update: stale (old) + current (recent) on one topic; recency wins. */
function temporalUpdate(i: number): Scenario {
  const spec = TEMPORAL_TOPICS[i % TEMPORAL_TOPICS.length];
  if (spec === undefined) return { memories: [], queries: [] };
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

// ---------------------------------------------------------------------------
// Authored pools (need semantic care, so hand-written).
// ---------------------------------------------------------------------------

const SINGLE_FACTS: Array<{ title: string; content: string; query: string }> = [
  {
    title: "Thesis submission deadline is December 15",
    content: "The thesis must be submitted by December 15.",
    query: "when is the thesis deadline",
  },
  {
    title: "Memory graph is stored in Neo4j Aura",
    content:
      "vmem keeps its memory graph in Neo4j Aura, a managed cloud database.",
    query: "what database stores the memory graph",
  },
  {
    title: "Embeddings use text-embedding-3-small",
    content:
      "Memories are embedded with OpenAI's text-embedding-3-small model.",
    query: "which embedding model does vmem use",
  },
  {
    title: "The office wifi password is on the whiteboard",
    content:
      "Guest wifi credentials are written on the meeting-room whiteboard.",
    query: "where is the office wifi password",
  },
  {
    title: "Quarterly review is the last Friday of the quarter",
    content:
      "The business quarterly review always lands on the final Friday of the quarter.",
    query: "when is the quarterly review",
  },
  {
    title: "Support SLA is a four hour first response",
    content: "Customer support commits to a first response within four hours.",
    query: "what is the support response SLA",
  },
  {
    title: "The mobile app minimum iOS version is 16",
    content: "The mobile app supports iOS 16 and above only.",
    query: "what is the minimum supported iOS version",
  },
  {
    title: "Backups run nightly at 2am UTC",
    content: "Database backups are taken every night at 2am UTC.",
    query: "when do database backups run",
  },
  {
    title: "The company was founded in 2019",
    content: "The company was incorporated in 2019.",
    query: "what year was the company founded",
  },
  {
    title: "Invoices are due net 30",
    content: "Customer invoices are payable on net-30 terms.",
    query: "what are the invoice payment terms",
  },
  {
    title: "The design tool of record is Figma",
    content: "All product design work happens in Figma.",
    query: "which design tool does the team use",
  },
  {
    title: "Release notes ship every other Tuesday",
    content:
      "Public release notes are published on a fortnightly Tuesday cadence.",
    query: "how often do release notes ship",
  },
];

const PREFERENCES: Array<{ title: string; content: string; query: string }> = [
  {
    title: "Prefers dark mode in all editors",
    content: "Always sets editors and terminals to a dark theme.",
    query: "what editor theme do I prefer",
  },
  {
    title: "Prefers TypeScript over JavaScript",
    content: "Chooses TypeScript for new projects for the type safety.",
    query: "which language do I prefer for new projects",
  },
  {
    title: "Prefers tabs over spaces",
    content: "Indents code with tabs, not spaces.",
    query: "do I prefer tabs or spaces",
  },
  {
    title: "Prefers async standups over live ones",
    content: "Would rather post a written standup than attend a live call.",
    query: "what kind of standup do I prefer",
  },
  {
    title: "Prefers window seats when flying",
    content: "Always books a window seat on flights.",
    query: "what seat do I prefer on flights",
  },
  {
    title: "Prefers oat milk in coffee",
    content: "Takes coffee with oat milk.",
    query: "what milk do I take in coffee",
  },
  {
    title: "Prefers vim keybindings",
    content: "Uses vim keybindings in every editor.",
    query: "what keybindings do I prefer",
  },
  {
    title: "Prefers reading on a Kindle over paper",
    content: "Reads books on a Kindle rather than print.",
    query: "how do I prefer to read books",
  },
  {
    title: "Prefers morning workouts",
    content: "Trains in the morning before work.",
    query: "when do I prefer to work out",
  },
  {
    title: "Prefers trains over flights for short trips",
    content: "Takes the train rather than flying for short journeys.",
    query: "how do I prefer to travel short distances",
  },
];

/** Lexical traps: gold = semantic answer; trap = same keyword, wrong sense (grade 0). */
const TRAPS: Array<{
  goldTitle: string;
  goldContent: string;
  trapTitle: string;
  trapContent: string;
  query: string;
}> = [
  {
    goldTitle: "Login keeps users signed in for thirty days",
    goldContent:
      "After authenticating, a session persists about a month before re-login.",
    trapTitle: "Booked the upstairs session room for the Java class",
    trapContent:
      "Reserved the session room; the class uses a login screen as a teaching example.",
    query: "how long does the login session last",
  },
  {
    goldTitle: "Background jobs retry three times with backoff",
    goldContent:
      "A failed queue task is retried up to three times with exponential delay.",
    trapTitle: "Will retry the marathon training block after the injury",
    trapContent:
      "Plan to retry the twelve week marathon plan once the knee heals.",
    query: "how many times do background jobs retry",
  },
  {
    goldTitle: "Cache entries expire after five minutes",
    goldContent: "The read cache holds values five minutes before refetching.",
    trapTitle: "Cash expense report from the team offsite",
    trapContent:
      "Submitted the cash expenses; receipts expire for reimbursement after ninety days.",
    query: "how long do cache entries stay valid",
  },
  {
    goldTitle: "API rate limit is 100 requests per minute",
    goldContent:
      "Clients may call the public API a hundred times each minute before throttling.",
    trapTitle: "Rated the climbing routes at the new gym",
    trapContent:
      "Spent the evening rating climbing routes at the limit of my grade.",
    query: "what is the api request rate limit",
  },
  {
    goldTitle: "The deploy key rotates every ninety days",
    goldContent:
      "The deployment signing key is rotated quarterly for security.",
    trapTitle: "Lost the spare house key at the cabin",
    trapContent: "Misplaced the spare house key while away for the weekend.",
    query: "how often does the deploy key rotate",
  },
  {
    goldTitle: "Feature branches merge via squash",
    goldContent:
      "Feature branches are squash-merged into main to keep history clean.",
    trapTitle: "Pruned the apple tree branch in the garden",
    trapContent: "Cut back a low branch on the apple tree over the weekend.",
    query: "how are feature branches merged",
  },
  {
    goldTitle: "The build pipeline runs on every commit",
    goldContent: "CI triggers the full build on each pushed commit.",
    trapTitle: "Made a commitment to run a half marathon",
    trapContent: "Committed to a half marathon and started a training plan.",
    query: "when does the build pipeline run",
  },
  {
    goldTitle: "The message queue holds events for seven days",
    goldContent:
      "Undelivered events stay in the queue for seven days before dropping.",
    trapTitle: "Stood in the queue at the bakery for ages",
    trapContent: "Waited in a long queue at the bakery on Saturday morning.",
    query: "how long does the message queue keep events",
  },
  {
    goldTitle: "Auth tokens expire after one hour",
    goldContent:
      "Access tokens are valid for one hour, then a refresh is required.",
    trapTitle: "Collected a casino token as a souvenir",
    trapContent: "Kept a casino token from the trip as a keepsake.",
    query: "how long are auth tokens valid",
  },
  {
    goldTitle: "The connection pool caps at twenty threads",
    goldContent:
      "The database connection pool allows at most twenty concurrent threads.",
    trapTitle: "Bought blue thread to fix a shirt button",
    trapContent: "Picked up blue thread to sew a loose button back on.",
    query: "how many threads does the connection pool allow",
  },
  {
    goldTitle: "S3 bucket lifecycle deletes objects after a year",
    goldContent: "Storage bucket policy expires objects after twelve months.",
    trapTitle: "Filled a bucket with sand at the beach",
    trapContent: "The kids filled a bucket with sand building a castle.",
    query: "when does the storage bucket delete old objects",
  },
  {
    goldTitle: "The primary key is a UUID v7",
    goldContent:
      "Records use a UUID version 7 as their primary key for time ordering.",
    trapTitle: "Found the missing piano key was sticking",
    trapContent: "A piano key was sticking and needed the felt cleaned.",
    query: "what type is used for the primary key",
  },
];

/**
 * Exact-match: a cluster of near-identical error-code memories that differ only
 * by a distinctive code + meaning. The query gives ONLY the code (not the
 * meaning), so embeddings — which blur similar codes — struggle to pick the
 * right lookalike, while the fulltext/BM25 leg matches the exact token. This is
 * where the hybrid's keyword leg earns its keep against pure vector.
 */
const ERROR_CODES: Array<{ code: string; meaning: string }> = [
  { code: "E2001", meaning: "the disk is full" },
  { code: "E2002", meaning: "the request timed out" },
  { code: "E2003", meaning: "the auth token is invalid" },
  { code: "E2004", meaning: "the client is rate limited" },
  { code: "E2005", meaning: "permission was denied" },
  { code: "E2006", meaning: "the resource was not found" },
  { code: "E2007", meaning: "there is a write conflict" },
  { code: "E2008", meaning: "the payload is too large" },
  { code: "E2009", meaning: "the media type is unsupported" },
  { code: "E2010", meaning: "an upstream gateway failed" },
  { code: "E2011", meaning: "the account quota is exceeded" },
  { code: "E2012", meaning: "a checksum did not match" },
];

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

const ABSTENTIONS = [
  "what is my blood type",
  "what was the score of last night's hockey game",
  "what is the capital of Mongolia",
  "how tall is the Eiffel Tower",
  "what is my neighbour's phone number",
  "what time does the moon rise tomorrow",
];

// ---------------------------------------------------------------------------
// Filler distractors — unrelated memories to pad the corpus (all grade 0).
// ---------------------------------------------------------------------------

const FILLER_TOPICS = [
  "Tried a new ramen place in Shibuya",
  "Booked flights for the Lisbon trip",
  "Replaced the bike chain after 3000km",
  "Finished reading a book on stoicism",
  "Set up a compost bin in the garden",
  "Switched to a standing desk this week",
  "Watered the office plants on Friday",
  "Recipe: roast cauliflower with tahini",
  "Renewed the gym membership for a year",
  "Adopted a rescue cat named Pixel",
  "Planted tomatoes and basil in spring",
  "Fixed a leaky kitchen tap at the weekend",
  "Took a pottery class downtown",
  "Started learning the ukulele",
  "Hiked the coastal trail on Saturday",
  "Repainted the spare bedroom a soft grey",
  "Sampled three cheeses at the market",
  "Cycled to the lighthouse and back",
  "Sorted the bookshelf by colour",
  "Brewed a batch of ginger beer",
];

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

// ---------------------------------------------------------------------------
// Scenario assembly.
// ---------------------------------------------------------------------------

/** One memory + one graded query (single-fact / preference style). */
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

function buildScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];

  for (let i = 0; i < MULTI_HOP_COUNT; i++) scenarios.push(multiHop(i));
  for (let i = 0; i < PROJECT_COUNT; i++) scenarios.push(projectCluster(i));
  for (let i = 0; i < TEMPORAL_COUNT; i++) scenarios.push(temporalUpdate(i));

  SINGLE_FACTS.forEach((f, i) => {
    scenarios.push(
      singleAnswerScenario(
        `sf${String(i)}`,
        "single-fact",
        "knowledge",
        ["fact"],
        f.title,
        f.content,
        f.query,
      ),
    );
  });

  PREFERENCES.forEach((p, i) => {
    scenarios.push(
      singleAnswerScenario(
        `pref${String(i)}`,
        "preference",
        "profile",
        ["preferences"],
        p.title,
        p.content,
        p.query,
      ),
    );
  });

  TRAPS.forEach((tr, i) => {
    const goldKey = `lt${String(i)}_gold`;
    const trapKey = `lt${String(i)}_trap`;
    scenarios.push({
      memories: [
        {
          key: goldKey,
          title: tr.goldTitle,
          content: tr.goldContent,
          type: "knowledge",
          tags: ["fact"],
        },
        {
          key: trapKey,
          title: tr.trapTitle,
          content: tr.trapContent,
          type: "episodic",
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
    });
  });

  scenarios.push(exactMatchScenario());

  scenarios.push({
    memories: [],
    queries: ABSTENTIONS.map((q) => ({
      query: q,
      type: "abstention",
      relevance: {},
    })),
  });

  scenarios.push({ memories: fillerMemories(FILLER_COUNT), queries: [] });

  return scenarios;
}

function isoFromAgeDays(ageDays: number): string {
  return new Date(Date.now() - ageDays * 86_400_000).toISOString();
}

export interface BenchmarkCorpus {
  memories: SeedMemory[];
  relationships: SeedRelationship[];
  queries: RetrievalEvalQuery[];
}

/** Generate the full labelled benchmark corpus. */
export function generateBenchmarkCorpus(): BenchmarkCorpus {
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

  for (const scenario of buildScenarios()) {
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
