# Labelled retrieve: default (Jev on) vs hybrid-only

Generated: 2026-09-17

Harness: `packages/backend/eval/*` (493 memories, 81 answerable, 6 abstentions). Same IR metrics as `eval:bench` (recall@k / MRR / nDCG@10). Not the synthetic toy in `retrieve.bench.test.ts`.

Main result is **default (Jev on)** — the always-on retrieve path (product default is a separate PR). Hybrid-only is the control via eval `judge: "off"`.

```bash
# hybrid-only legs (CI; Jev off)
pnpm --filter @vmem/backend eval:bench

# default-on Jev vs hybrid-only
EVAL_JEV=1 pnpm --filter @vmem/backend eval:jev
```

`EVAL_JEV=1` treats Jev as default in this harness and disables it with `judge: "off"`. Product retrieve is still opt-in (`judge: "jev"`). Without `TYPESAFE_API_KEY` the comparison **fails closed**. Mocking System One is not valid for this table.

## This run

|                            |                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embeddings                 | synthetic (no `OPENROUTER_API_KEY` in this cloud VM; Vedant has OpenRouter on the user account)                                                                                          |
| default (Jev on)           | **not ran** — `TYPESAFE_API_KEY` unset here. `POST https://api.typesafe.ai/v1/systemone` is reachable (HTTP 403 `Must supply an API key!`). Prod `clear-bear-690` has the dashboard key. |
| hybrid-only (`judge: off`) | **ran** (`eval.test.ts` labelled full hybrid)                                                                                                                                            |

Parent re-run with secrets and replace the default (Jev) column. The test prints `buildJevGateReport`.

## Side-by-side

| Config                   | recall@1 | recall@3 | recall@5   | recall@10 | P@5   | MRR   | nDCG@10 | ctx tok | p50 ms | p95 ms |
| ------------------------ | -------- | -------- | ---------- | --------- | ----- | ----- | ------- | ------- | ------ | ------ |
| default (Jev on)         | —        | —        | —          | —         | —     | —     | —       | —       | —      | —      |
| hybrid-only (judge: off) | 75.3%    | 96.3%    | **100.0%** | 100.0%    | 32.1% | 0.988 | 0.975   | 278     | 47     | 48     |

Δ vs hybrid-only is empty until `EVAL_JEV=1` completes. Neo4j 2026-07-18 bar (apply to **default (Jev)** once live): R@5 92.0%, MRR 0.974, nDCG@10 0.857. Hybrid-only already clears that bar.

### nDCG@10 by query type (hybrid-only)

| type         | n   | hybrid-only |
| ------------ | --- | ----------- |
| single-fact  | 12  | 1.000       |
| preference   | 10  | 1.000       |
| exact-match  | 12  | 1.000       |
| project      | 8   | 1.000       |
| lexical-trap | 12  | 0.969       |
| update       | 12  | 0.998       |
| multi-hop    | 12  | 0.862       |
| temporal     | 3   | 1.000       |

Lexical-trap nDCG@10 **0.969** is the slot default-on Jev is meant to move. Abstention: all 6 hybrid-only top scores stay **< 0.8**.

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
- Default-on over-fetches 20 hits; metrics are @k=10.
- Synthetic embeddings change the hybrid head Jev would see vs OpenRouter `text-embedding-3-small`.
- Eval `judge: "off"` is harness-only until the always-on product PR ships a public disable flag.
