# Labelled retrieve: hybrid vs hybrid + Jev

Generated: 2026-09-17

Harness: `packages/backend/eval/*` (493 memories, 81 answerable, 6 abstentions). Same IR metrics as `eval:bench` (recall@k / MRR / nDCG@10). Not the synthetic toy in `retrieve.bench.test.ts`.

```bash
# hybrid-only (CI)
pnpm --filter @vmem/backend eval:bench

# hybrid vs live TypeSafe Jev
EVAL_JEV=1 pnpm --filter @vmem/backend eval:jev
```

`judge: "jev"` is wired through `retrieveEval` → `applyJevRetrieveGate` (over-fetch 20, noul keep threshold **0.5**, slice to k=10). `rerank: "jev"` is the same gate. `EVAL_JEV=1` without `TYPESAFE_API_KEY` (or `TYPESAFE_AI_API_KEY` / `JEV_API_KEY`) **fails closed**. Mocking System One is not valid for this table.

## This run

|              |                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embeddings   | synthetic (no `OPENROUTER_API_KEY` in this cloud VM)                                                                                                                         |
| Hybrid       | **ran** on this revision (`eval.test.ts` labelled ablation)                                                                                                                  |
| Hybrid + Jev | **not ran** — `TYPESAFE_API_KEY` was unset. `POST https://api.typesafe.ai/v1/systemone` is reachable (HTTP 403 `Must supply an API key!`, ~0.3s). Egress is not the blocker. |
| Prod         | Convex `clear-bear-690` already has #182 + dashboard `TYPESAFE_API_KEY`; that key is not injected into this agent environment                                                |

Re-run with a live key and replace the Jev column / diagnostics below. The test prints the full markdown from `buildJevGateReport`.

## Side-by-side

| Config            | recall@1 | recall@3 | recall@5   | recall@10 | P@5   | MRR   | nDCG@10 | ctx tok | p50 ms | p95 ms |
| ----------------- | -------- | -------- | ---------- | --------- | ----- | ----- | ------- | ------- | ------ | ------ |
| full hybrid       | 75.3%    | 96.3%    | **100.0%** | 100.0%    | 32.1% | 0.988 | 0.975   | 278     | 47     | 48     |
| full hybrid + jev | —        | —        | —          | —         | —     | —     | —       | —       | —      | —      |

Δ vs hybrid is empty until `EVAL_JEV=1` completes. Neo4j 2026-07-18 bar for full hybrid: R@5 92.0%, MRR 0.974, nDCG@10 0.857. This hybrid run clears that bar.

### nDCG@10 by query type (hybrid)

| type         | n   | full hybrid |
| ------------ | --- | ----------- |
| single-fact  | 12  | 1.000       |
| preference   | 10  | 1.000       |
| exact-match  | 12  | 1.000       |
| project      | 8   | 1.000       |
| lexical-trap | 12  | 0.969       |
| update       | 12  | 0.998       |
| multi-hop    | 12  | 0.862       |
| temporal     | 3   | 1.000       |

Lexical-trap nDCG@10 **0.969** is the slot Jev is meant to move (drop wrong-sense keyword hits). Abstention: all 6 hybrid top scores stay **< 0.8** (`threshold: 0.8` would return `[]` without Jev).

## Jev gate diagnostics

|                                               |         |
| --------------------------------------------- | ------- |
| System One calls                              | not run |
| Fail-open                                     | n/a     |
| Hits dropped (noul < 0.5)                     | n/a     |
| Near-ties (noul in [0.45, 0.55], kept at 0.5) | n/a     |
| input_tokens / output_tokens                  | n/a     |

## Caveats

- Threshold **0.5** sits between live-smoke keep **0.66** and trap **0.03**. Near-ties in `[0.45, 0.55]` stay in the list.
- Jev is weak at date math; temporal windows still come from `temporal.ts`.
- Hybrid candidate pool for the gate is top **20**; metrics are @k=10.
- Synthetic embeddings change the hybrid head Jev would see vs OpenRouter `text-embedding-3-small`. Prefer `OPENROUTER_API_KEY` + `TYPESAFE_API_KEY` together when quoting numbers externally.
- Prod retrieve with `judge: "jev"` already fail-opens to hybrid when the key is missing. This labelled comparison does **not** fail-open — it errors so hybrid numbers are not copied into the Jev column.
