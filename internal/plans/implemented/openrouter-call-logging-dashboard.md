# OpenRouter Call Logging + Dashboard

## Context

vmem currently fires OpenRouter `fetch()` calls from 5 different files plus 1 embedding service. Zero observability — no token counts, no cost, no latency, no error trail. User wants every call logged (including BYOK cost via OpenRouter's inline `usage` field) and surfaced as a top-level dashboard route with a sidebar entry.

Bonus: 4 of those 5 call-sites duplicate the same `extractLLMContent` helper. A shared wrapper kills the dupe while it's there.

## Decisions (from user)

- Sidebar: top-level under Account group
- Prompt/completion text: opt-in via env var `OPENROUTER_LOG_PROMPTS=1` (truncate 4KB prompt / 2KB completion)
- Scope: chat + embeddings
- Retention: forever (no TTL v1)

## Backend

### 1. `validators.ts` — add `openRouterLogFields`

```ts
export const openRouterLogFields = {
  userId: v.id("users"),
  feature: v.union(
    v.literal("enrichment"),
    v.literal("dream-synthesis"),
    v.literal("context-prompt"),
    v.literal("fact-extraction"),
    v.literal("entity-backfill"),
    v.literal("embedding"),
  ),
  endpoint: v.union(v.literal("chat"), v.literal("embedding")),
  model: v.string(),
  status: v.number(), // HTTP status
  ok: v.boolean(),
  errorClass: v.optional(
    v.union(
      v.literal("network"),
      v.literal("http_4xx"),
      v.literal("http_5xx"),
      v.literal("parse"),
      v.literal("timeout"),
    ),
  ),
  errorMessage: v.optional(v.string()),
  latencyMs: v.number(),
  generationId: v.optional(v.string()), // OpenRouter `id` (gen-xxx)
  provider: v.optional(v.string()),
  finishReason: v.optional(v.string()),
  nativeFinishReason: v.optional(v.string()),
  promptTokens: v.optional(v.number()),
  completionTokens: v.optional(v.number()),
  totalTokens: v.optional(v.number()),
  cachedTokens: v.optional(v.number()),
  cacheWriteTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  costUsd: v.optional(v.number()),
  upstreamCostUsd: v.optional(v.number()),
  isByok: v.optional(v.boolean()),
  promptPreview: v.optional(v.string()), // only set when env opt-in
  completionPreview: v.optional(v.string()), // only set when env opt-in
  createdAt: v.number(),
};
```

### 2. `schema.ts` — register table

```ts
openRouterLogs: defineTable(openRouterLogFields)
  .index("by_user", ["userId"])
  .index("by_user_createdAt", ["userId", "createdAt"])
  .index("by_user_feature", ["userId", "feature"]),
```

### 3. New `convex/lib/openRouter.ts` — shared wrapper

Single source for both endpoints. Handles auth header, `usage:{include:true}` injection, timing, response parsing, log scheduling.

```ts
export type OpenRouterFeature = /* 6 literals */;

export async function callOpenRouterChat(ctx: ActionCtx, args: {
  apiKey: string; userId: Id<"users">; feature: OpenRouterFeature;
  model: string; messages: Message[]; temperature?: number;
}): Promise<{ content: string | null; status: number; ok: boolean }>;

export async function callOpenRouterEmbeddings(ctx: ActionCtx, args: {
  apiKey: string; userId: Id<"users">; model: string; input: string[];
}): Promise<{ embeddings: number[][]; status: number; ok: boolean }>;
```

Behaviour:

- inject `usage: { include: true }` into chat body (cost arrives inline)
- `performance.now()` around the fetch for `latencyMs`
- on every outcome (ok/error/timeout) → `ctx.scheduler.runAfter(0, internal.openRouterLogs.recordInternal, {...})`
- preview fields populated only if `process.env.OPENROUTER_LOG_PROMPTS === "1"` — truncated client-side
- embeddings: cost computed via small const `EMBEDDING_PRICE_USD_PER_1K` table (only `openai/text-embedding-3-small` today → 1 entry)
- internalises the `extractLLMContent` helper that's currently duplicated 4×

### 4. New `convex/openRouterLogs.ts`

- `recordInternal` (internalMutation) — args = `openRouterLogFields` minus `_id`/`_creationTime`; insert
- `listMine` (authQuery) — `paginationOptsValidator` + optional filters (`feature`, `model`, `status`, `range`); reads `by_user_createdAt` desc; returns rows shaped from `openRouterLogFields`
- `summaryMine` (authQuery) — today/7d/30d aggregates (totalCost, totalTokens, avgLatency, successRate); cap scan at 5k rows, mark `isApprox: true` if hit

### 5. Refactor 5 call-sites + embedding service

Each site loses ~30 lines of fetch+parse+extract → replaced with `callOpenRouterChat(ctx, { apiKey, userId, feature: "...", model, messages, temperature })`. Files:

- `convex/neo4jActions/enrichment.ts` (lines 71–91) — `feature: "enrichment"`
- `convex/neo4jActions/dreamMode.ts` (lines 67–107) — `feature: "dream-synthesis"`
- `convex/neo4jActions/contextPromptActions.ts` (lines 86–124) — `feature: "context-prompt"`
- `convex/neo4jActions/factExtraction.ts` (lines 57–91) — `feature: "fact-extraction"`
- `convex/neo4jActions/migration.ts` (lines 393–413) — `feature: "entity-backfill"`
- `packages/backend/src/neo4j/embeddingService.ts` — `postWithRetry` becomes a thin retry shell that calls `callOpenRouterEmbeddings` per attempt, so retries are also logged. Callers (dreamMode, migration) thread `ctx` + `userId` through. Retain existing batch-of-20 chunking.

Resolve `userId` in each action via existing `tryUserEnvVarByClerkId` flow (it already gives us the user row); pass to wrapper.

## Frontend

### 6. Sidebar — `apps/web/src/components/sidebar/nav-config.ts`

Add to `Account` group, between Activity and Proposals:

```ts
{ href: "/openrouter-logs", label: "OpenRouter Logs", icon: IconReceipt2 }
```

(IconReceipt2 from `@tabler/icons-react` — implies cost/billing; not already in use.)

### 7. Route — `apps/web/src/routes/_main/openrouter-logs/`

Mirror `/activity` structure:

```
openrouter-logs/
  index.tsx                  # route shell, <250 lines
  -searchParams.ts           # nuqs schema
  _components/
    LogsSummary.tsx          # 4 stat cards (today)
    LogsFiltersDropdown.tsx  # single dropdown w/ count badge per CLAUDE.md
    LogsTable.tsx            # virtuoso table, row click → side panel
    LogRowDetail.tsx         # side panel for full row + previews
```

`-searchParams.ts` (nuqs):

```ts
features: parseAsArrayOf(parseAsStringLiteral(FEATURES)).withDefault([]),
models:   parseAsArrayOf(parseAsString).withDefault([]),
status:   parseAsStringLiteral(["all","success","error"]).withDefault("all"),
range:    parseAsStringLiteral(["today","7d","30d","all"]).withDefault("7d"),
sortDir:  parseAsStringLiteral(["asc","desc"]).withDefault("desc"),
```

Stat cards (today): Total cost USD · Total tokens · Avg latency ms · Success rate %.

Table columns: Time · Feature (badge) · Model · Tokens (`in→out`, cached muted) · Cost · Latency · Status (success/error pill).

Filter dropdown count badge: count non-default filter fields (features, models, status, range). Sort + view stay separate per CLAUDE.md.

Empty state: "No OpenRouter calls yet — fire one to populate."

### 8. Live data

- `useQuery(api.openRouterLogs.listMine, { paginationOpts, ...filters })` — paginate page-size 50
- `useQuery(api.openRouterLogs.summaryMine)` — for stat cards
- Convex live updates handle "new log appears" automatically; no polling

## Files Touched

**Created**

- `packages/backend/convex/lib/openRouter.ts`
- `packages/backend/convex/openRouterLogs.ts`
- `apps/web/src/routes/_main/openrouter-logs/index.tsx`
- `apps/web/src/routes/_main/openrouter-logs/-searchParams.ts`
- `apps/web/src/routes/_main/openrouter-logs/_components/{LogsSummary,LogsFiltersDropdown,LogsTable,LogRowDetail}.tsx`

**Modified**

- `packages/backend/convex/validators.ts` — add `openRouterLogFields`
- `packages/backend/convex/schema.ts` — register table
- `packages/backend/convex/neo4jActions/enrichment.ts`
- `packages/backend/convex/neo4jActions/dreamMode.ts`
- `packages/backend/convex/neo4jActions/contextPromptActions.ts`
- `packages/backend/convex/neo4jActions/factExtraction.ts`
- `packages/backend/convex/neo4jActions/migration.ts`
- `packages/backend/src/neo4j/embeddingService.ts`
- `apps/web/src/components/sidebar/nav-config.ts`

## Type Safety (CLAUDE.md hard rules)

- Field set lives in `validators.ts` — `defineTable(openRouterLogFields)` + return validator `v.object({ _id: v.id("openRouterLogs"), _creationTime: v.number(), ...openRouterLogFields })`. Never duplicated.
- Frontend uses `Doc<"openRouterLogs">` and `FunctionReturnType<typeof api.openRouterLogs.listMine>`. Never manual interfaces.
- Wrapper response shape is concrete (`content: string | null`, etc.) — no `unknown`/`as`.
- Response parsing: typed narrowing via `typeof x === "string"` + property checks. No `as` casts. If parse fails → log row with `errorClass: "parse"`, return `content: null`.

## UI Compliance

- Stat cards & table: tonal `bg-muted/40`, no shadows/borders for separation
- Active filter state: `bg-*` only, no border
- Filters consolidated into single dropdown with count badge; sort separate
- Detail side panel uses `shadow-*` (it's an overlay — allowed)
- Mobile: page title via `PageContainer`'s `title` prop

## Verification

1. **Types** — `cd packages/backend && npx convex codegen --typecheck enable` passes
2. **Trigger logs** — save a memory in dashboard → enrichment fires → row appears in `/openrouter-logs` within ~1s (Convex live query)
3. **Run Dream Mode button** → confirm `dream-synthesis` rows + embedding rows appear
4. **Cost shows** — pick a chat row, confirm `costUsd` populated (BYOK or OpenRouter-billed)
5. **Embeddings logged** — confirm `endpoint: "embedding"` rows have tokens + computed cost
6. **Filters** — toggle features/models/status/range → URL updates → table filters reactively
7. **Privacy default** — without `OPENROUTER_LOG_PROMPTS`, `promptPreview`/`completionPreview` are absent
8. **Privacy opt-in** — set env var, retrigger, confirm previews populate (truncated)
9. **Failure path** — temporarily break the API key → confirm row with `ok: false`, `errorClass: "http_4xx"` lands

## Unresolved questions

1. **Icon choice** — happy with `IconReceipt2`, or prefer a different Tabler icon (e.g. `IconCoin`, `IconActivityHeartbeat`, `IconCpu2`)?
2. **Page label** — "OpenRouter Logs" or shorter ("LLM Usage" / "API Usage" / "Inference Logs")? Affects sidebar real-estate.
3. **Profile/team attribution** — log against personal `userId` only (current plan), or also stamp `profileId` so team members can see team-wide spend later? Cheap to add now, expensive to backfill.
4. **Failure dedup** — if a 429 storm hits in a loop, do we want insert-side coalescing (e.g. one row per minute per user+feature+errorClass), or just log every attempt? Plan currently logs every attempt.
5. **`/generation` enrichment** — skip for v1 (current plan), or schedule a follow-up call **only on errors** to capture upstream provider fallback chain for diagnostics?
