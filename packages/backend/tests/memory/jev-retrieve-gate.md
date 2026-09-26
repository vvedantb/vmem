# Jev retrieve-gate (AI Gateway `typesafe-ai/jev`)

Second-stage score / best **rerank** after hybrid retrieve (no noul hard-drop). **On by default** when `AI_GATEWAY_API_KEY` is set. No client flag required. Missing key or a Jev error → hybrid hits only (no 422).

What to drop now that this is live: [jev-simplify.md](./jev-simplify.md).

**GLiNER is not in this change.** On-write JointIE / span extraction is a separate P0; hosting (sidecar vs API) is still the blocker. Do not call GLiNER at retrieve time. Research: [PR #181](https://github.com/vvedantb/vmem/pull/181) (`extraction-research-gliner-jev.md`).

## Enable

1. Set the AI Gateway key (never commit the value). The same key covers chat, embeddings, and Jev:

```bash
export AI_GATEWAY_API_KEY="…"
```

2. Convex **action** env (dashboard → Settings → Environment Variables, or `npx convex env set`):

```
AI_GATEWAY_API_KEY
```

Lookup is **deployment `process.env` only**. The AI SDK reads it. There is no in-app Secrets page and no per-user override. `TYPESAFE_API_KEY` is not read.

3. Call retrieve as usual. HTTP / SDK / MCP / Convex / dashboard / Chrome extension all get Jev when the key is present:

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

Ablation / labelled IR (skip Jev): HTTP/SDK/Convex `judge: "off"`, or LoCoMo CLI `LOCOMO_IR_JUDGE=off`. Live MCP retrieve does not expose `judge`. `judge: "jev"` and `rerank: "jev"` are accepted no-ops on HTTP/SDK. `rerank: true` is the local #179 top-20 extra (not a cross-encoder); it is skipped when Jev actually runs.

## What it does

After FTS / vector / graph / rank (hybrid candidate generation is unchanged):

1. Over-fetch up to 20 hits (only when `AI_GATEWAY_API_KEY` resolved).
2. One `experimental_evaluate` call (`model: typesafe-ai/jev`, 30s timeout, one retry, zero data retention, tag `retrieve`). The SDK authenticates with `AI_GATEWAY_API_KEY`.
3. In-process questions stay `noul`, `choice`, and `score`. The client sends each noul question as a gateway **boolean** and stores `probability` back as `noul`. **`criteria` is top-level** on the question: noul `{ true, false }`, choice object map, score ordered string array. Retrieve-gate sends:
   - per-hit **noul** keep?
   - per-hit **score** with `criteria`: `irrelevant` / `weakly related` / `directly answers`
   - **choice** over hit ids plus `none`
4. Annotate every head hit with `jevRelevant` / `jevScore`. Rank the **full** head by score, then noul, then hybrid; promote the Choice winner. **Do not hard-drop** on noul, and do not empty the list on `best: none`. Slice to the caller limit after rerank. Live smoke (Convex vmem): gold 0.66 vs traps 0.03 / 0.03, `best` confidence 0.77 — traps stay in the list, ranked below gold.
5. Context Trace keeps BM25 / vector / graph / temporal. Adds `jevRelevant`, `jevScore`, `jevConfidence`, optional `jevBest`.

Jev 1.13 is weak at date math — `temporal.ts` still owns windows. State includes `referenceDate` when the caller sent one; timestamps are not compared in-model.

## Convex constraints

Retrieve already runs as an **action**:

| Surface                                | Convex primitive    | Jev                            |
| -------------------------------------- | ------------------- | ------------------------------ |
| Dashboard `memoryApi.retrieveMemories` | `authAction`        | AI SDK `experimental_evaluate` |
| `POST /api/v1/memories/retrieve`       | `httpAction`        | same client as embeddings      |
| MCP `memory_retrieve`                  | `/mcp` `httpAction` | same client                    |

Queries and mutations **cannot** call Jev. Do not move this call onto a query. HTTP handlers cannot be `"use node"`; the AI SDK evaluate path stays in the shared engine module.

## Env names (no values)

| Name                 | Use                                                                  |
| -------------------- | -------------------------------------------------------------------- |
| `AI_GATEWAY_API_KEY` | **This is the one to set.** Chat, embeddings, and `typesafe-ai/jev`. |

The client does not call `api.typesafe.ai` and does not read `TYPESAFE_API_KEY`.

## Rerank, no hard-drop

Hard-drop at noul `< 0.5` in `applyAnswers` cut labelled R@5: default Jev was **84.6%** vs hybrid-only **100%** because project / update / multi-hop gold left the top 5. Jev was already good at ranking (MRR 1.000) and at lexical-trap nDCG.

So the gate **only reranks**. Every head hit is annotated and sorted (`compareKept` + best-first). Low-noul traps stay in the list instead of disappearing. `best: none` does not return `[]` — hybrid still needs those hits at k=5. Fail-open on API/parse errors is unchanged.

`DEFAULT_JEV_RELEVANCE_THRESHOLD` (0.5) stays as the live-smoke calibration (keep 0.66 vs trap 0.03) for eval diagnostics, not as a retrieve filter.

## Calibrate later

Freeze questions with `ai evaluate` (model `typesafe-ai/jev`) on labelled abstentions + lexical traps before treating noul as a drop again. Live Jev calls are skipped in CI; unit tests inject the evaluate function. No API keys in the repo.

## Labelled IR comparison

Default-on Jev vs hybrid-only (`judge: "off"`) on the real labelled harness (`packages/backend/eval/*`, 493 memories, 81 answerable, 6 abstentions). Main result is **default (Jev on)** — the always-on path. Product retrieve is default-on when `AI_GATEWAY_API_KEY` is set (PR #183). Hybrid-only is the control.

```bash
EVAL_JEV=1 pnpm --filter @vmem/backend eval:jev
```

Requires `AI_GATEWAY_API_KEY`. The eval fails closed if the key is missing — it does not mock Jev or copy hybrid numbers. `pnpm test` / `eval:bench` stay hybrid-only.

Results: [`benchmark/jev-gate-results.md`](./benchmark/jev-gate-results.md). Optional `EVAL_JEV_CONCURRENCY` (default 4).

## Dream Mode merge (always-on, no hard-drop)

Same Jev client (`evaluateSystemOne` / `AI_GATEWAY_API_KEY`, tag `dream-merge`) as retrieve. Dream Mode still **clusters heuristically** (`clusterNearDuplicateMemories` / `pickClusterKeeper`). Jev annotates each heuristic near-dup cluster; it does **not** drop clusters. Dream portraits stay on the chat model.

The dream pass already runs as a Convex **action** (mutations still cannot call Jev). Per cluster, Jev answers:

1. **noul `merge`** — metadata only (how duplicate-like); never a skip
2. **choice `keeper`** — which memory is current truth?
3. **noul `auto_accept`** — safe to materialize without inbox review?

Every heuristic near-dup cluster still becomes a merge proposal. Thresholds (in `engine/memory/jevMergeGate.ts`):

| Signal                           | Threshold                        | Effect                                                 |
| -------------------------------- | -------------------------------- | ------------------------------------------------------ |
| keeper choice confidence ≥ `0.6` | `JEV_KEEPER_OVERRIDE_CONFIDENCE` | Honor Jev's keeper; otherwise keep `pickClusterKeeper` |
| auto-accept noul ≥ `0.7`         | `JEV_AUTO_ACCEPT_NOUL`           | When user auto-accept is on, materialize; else inbox   |

**Fail-open:** missing `AI_GATEWAY_API_KEY` or a Jev error keeps today's heuristic (create the proposal; auto-accept still materializes). Jev never writes merged title/content. Keeper choice confidence is the selected option's gateway probability.

`DreamRunResult` counts `clustersScanned`, `jevScored` (Jev returned metadata), and `failOpen`.
