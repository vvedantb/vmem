# Jev retrieve-gate (TypeSafe System One)

Second-stage keep / score / best after hybrid retrieve. **On by default** when `TYPESAFE_API_KEY` is set. No client flag required. Missing key or Jev HTTP failure → hybrid hits only (no 422).

What to drop now that this is live: [jev-simplify.md](./jev-simplify.md).

**GLiNER is not in this change.** On-write JointIE / span extraction is a separate P0; hosting (sidecar vs API) is still the blocker. Do not call GLiNER at retrieve time. Research: [PR #181](https://github.com/vvedantb/vmem/pull/181) (`extraction-research-gliner-jev.md`).

## Enable

1. Set a TypeSafe key (never commit the value):

```bash
# local CLI / unit-adjacent scripts
export TYPESAFE_API_KEY="…"

# aliases, same resolution order as the client
# TYPESAFE_AI_API_KEY
# JEV_API_KEY   # local alias only — do not add this name as a Convex dashboard secret
```

2. Convex **action** env (dashboard → Settings → Environment Variables):

```
TYPESAFE_API_KEY
```

Per-user override: dashboard **Settings → Secrets** with the same key name (`userEnvVars`). Lookup is user secret first, then deployment `process.env`.

3. Call retrieve as usual. HTTP / SDK / MCP / Convex / dashboard / Chrome extension all get the gate when the key is present:

```json
{
  "query": "What package manager does the user prefer?",
  "limit": 10
}
```

SDK:

```ts
await vmem.search("What package manager does the user prefer?", {
  limit: 10,
});
```

Ablation / labelled IR (skip Jev): `judge: "off"`. `judge: "jev"` and `rerank: "jev"` are accepted no-ops. `rerank: true` is the local #179 top-20 extra (not a cross-encoder); it is skipped when Jev actually runs.

## What it does

After FTS / vector / graph / rank (hybrid candidate generation is unchanged):

1. Over-fetch up to 20 hits (only when a TypeSafe key resolved).
2. One `POST https://api.typesafe.ai/v1/systemone` (`model: jev-latest`, `Authorization: Bearer $TYPESAFE_API_KEY`).
3. Question `type` values are only `noul`, `choice`, and `score` (never `boolean`). **`criteria` is top-level** on the question: noul `{ true, false }`, choice object map, score ordered string array. Retrieve-gate sends:
   - per-hit **noul** keep?
   - per-hit **score** with `criteria`: `irrelevant` / `weakly related` / `directly answers`
   - **choice** over hit ids plus `none`
4. Drop if noul `< 0.5` (`DEFAULT_JEV_RELEVANCE_THRESHOLD`). Live smoke (Convex vmem): keep 0.66, drop 0.03 / 0.03, `best` confidence 0.77. Rank survivors by score, then noul. Promote the Choice winner.
5. Context Trace keeps BM25 / vector / graph / temporal. Adds `jevRelevant`, `jevScore`, `jevConfidence`, optional `jevBest`.

Jev 1.13 is weak at date math — `temporal.ts` still owns windows. State includes `referenceDate` when the caller sent one; timestamps are not compared in-model.

## Convex constraints

Retrieve already runs as an **action**:

| Surface                                | Convex primitive    | `fetch`                             |
| -------------------------------------- | ------------------- | ----------------------------------- |
| Dashboard `memoryApi.retrieveMemories` | `authAction`        | yes                                 |
| `POST /api/v1/memories/retrieve`       | `httpAction`        | yes (same as OpenRouter embeddings) |
| MCP `memory_retrieve`                  | `/mcp` `httpAction` | yes                                 |

Queries and mutations **cannot** `fetch`. Do not move this call onto a query.

`"use node"` is **not** required for `fetch`. HTTP handlers cannot be `"use node"` themselves. If a future TypeSafe SDK needs Node built-ins, wrap `evaluateSystemOne` in an `internalAction` with `"use node"` and `ctx.runAction` it from retrieve.

## Env names (no values)

| Name                  | Use                                               |
| --------------------- | ------------------------------------------------- |
| `TYPESAFE_API_KEY`    | TypeSafe docs / curl. **This is the one to set.** |
| `TYPESAFE_AI_API_KEY` | `@ai-sdk/typesafe-ai` alias                       |
| `JEV_API_KEY`         | Local alias only                                  |

`AI_GATEWAY_API_KEY` is for Vercel AI Gateway `typesafe-ai/jev`, not `api.typesafe.ai`. This gate talks to TypeSafe directly.

## Calibrate later

Threshold `0.5` sits between live keep `0.66` and trap `0.03`. Freeze questions with `ai evaluate` (default model `typesafe-ai/jev`) on labelled abstentions + lexical traps before changing `t`. Live System One calls are skipped in CI; unit tests mock HTTP. No API keys in the repo.

## Labelled IR comparison

Default-on Jev vs hybrid-only (`judge: "off"`) on the real labelled harness (`packages/backend/eval/*`, 493 memories, 81 answerable, 6 abstentions). Main result is **default (Jev on)** — the always-on path. Product retrieve is default-on when `TYPESAFE_API_KEY` is set (PR #183). Hybrid-only is the control.

```bash
EVAL_JEV=1 pnpm --filter @vmem/backend eval:jev
```

Requires `TYPESAFE_API_KEY` (or `TYPESAFE_AI_API_KEY` / `JEV_API_KEY`). The eval fails closed if the key is missing — it does not mock System One or copy hybrid numbers. `pnpm test` / `eval:bench` stay hybrid-only.

Results: [`benchmark/jev-gate-results.md`](./benchmark/jev-gate-results.md). Optional `EVAL_JEV_CONCURRENCY` (default 4).
