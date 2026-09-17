# vmem labelled retrieve: default (Jev on) vs hybrid-only

Generated: 2026-09-17 · Corpus: 493 memories · Answerable: 81 · Abstention: 6 · Embeddings: synthetic · Jev: live System One `jev-latest` · Noul keep threshold: 0.5

Main result is **default (Jev on)** — the always-on retrieve path. Hybrid-only is the control (`judge: "off"`).

Re-run (needs `TYPESAFE_API_KEY`):

```bash
EVAL_JEV=1 pnpm --filter @vmem/backend eval:jev
```

CI `eval:bench` / `pnpm test` stay hybrid-only. `EVAL_JEV=1` without a TypeSafe key fails closed (no mock numbers).

## Side-by-side

| Config | recall@1 | recall@3 | recall@5 | recall@10 | P@5 | MRR | nDCG@10 | ctx tok | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| default (Jev on) | 77.2% | 81.5% | 84.6% | 91.7% | 23.7% | 1.000 | 0.943 | 289 | 360 | 692 |
| hybrid-only (judge: off) | 75.3% | 96.3% | 100.0% | 100.0% | 32.1% | 0.988 | 0.975 | 278 | 61 | 66 |

| Metric | hybrid-only | default (Jev) | Δ |
| --- | --- | --- | --- |
| recall@1 | 75.3% | 77.2% | +1.9% |
| recall@5 | 100.0% | 84.6% | -15.4% |
| recall@10 | 100.0% | 91.7% | -8.3% |
| P@5 | 32.1% | 23.7% | -8.4% |
| MRR | 0.988 | 1.000 | +0.012 |
| nDCG@10 | 0.975 | 0.943 | -0.032 |

Δ is default (Jev) minus hybrid-only.

## nDCG@10 by query type

| type | n | default (Jev on) | hybrid-only (judge: off) |
| --- | --- | --- | --- |
| single-fact | 12 | 1.000 | 1.000 |
| preference | 10 | 1.000 | 1.000 |
| exact-match | 12 | 1.000 | 1.000 |
| project | 8 | 0.762 | 1.000 |
| lexical-trap | 12 | 1.000 | 0.969 |
| update | 12 | 0.957 | 0.998 |
| multi-hop | 12 | 0.825 | 0.862 |
| temporal | 3 | 0.972 | 1.000 |

## Recall@5 by query type

| type | n | default (Jev on) | hybrid-only (judge: off) |
| --- | --- | --- | --- |
| single-fact | 12 | 100.0% | 100.0% |
| preference | 10 | 100.0% | 100.0% |
| exact-match | 12 | 100.0% | 100.0% |
| project | 8 | 43.8% | 100.0% |
| lexical-trap | 12 | 100.0% | 100.0% |
| update | 12 | 75.0% | 100.0% |
| multi-hop | 12 | 62.5% | 100.0% |
| temporal | 3 | 83.3% | 100.0% |

## Abstention (6 queries with no gold)

| Config | empty lists | top-score max | top-score mean |
| --- | --- | --- | --- |
| default (Jev on) | 6 / 6 | 0.000 | 0.000 |
| hybrid-only (judge: off) | 0 / 6 | 0.604 | 0.430 |

## Jev gate diagnostics

| | |
| --- | --- |
| System One calls | 87 |
| Fail-open (HTTP/parse; hybrid kept) | 0 query errors, 0 answerable lists with no `jevRelevant` |
| Hits dropped (noul < 0.5) | 120 |
| Near-ties (noul in [0.45, 0.55], kept at 0.5) | 9 |
| Answerable queries emptied by the gate | 0 |
| Answerable queries with recall@5 drop vs hybrid-only | 24 |
| Gold titles hybrid-only had in top 10 that Jev removed | 16 |
| input_tokens (if API returned usage) | 483095 |
| output_tokens (if API returned usage) | 76119 |
| default (Jev) R@5 still ≥ Neo4j 92.0% | no (below Neo4j 92.0% R@5 bar) |

### Gold titles removed by Jev

| type | query | dropped gold |
| --- | --- | --- |
| multi-hop | who sets the roadmap for Nova | Noor owns roadmap planning for the infra group |
| multi-hop | who sets the roadmap for Mizar | the Mizar roadmap is planned by the platform group |
| multi-hop | who supports customers using Antares | Yuki runs the growth support desk |
| project | what do we know about the Polaris project | The mobile team stores data in a managed column store |
| project | what do we know about the Castor project | The infra team stores data in a managed column store; The infra team runs on-call for the first year |
| project | what do we know about the Vela project | The payments team gates rollout behind a feature flag; The payments team runs on-call for the first year |
| project | what do we know about the Crux project | The search team stores data in a managed column store |
| project | what do we know about the Hydra project | The identity team stores data in a managed column store |
| project | what do we know about the Phoenix project | The billing team runs on-call for the first year |
| project | what do we know about the Aquila project | The analytics team stores data in a managed column store; The analytics team runs on-call for the first year |
| project | what do we know about the Corvus project | The platform team gates rollout behind a feature flag |
| update | what is primary cloud region currently | primary cloud region was us-east-1 |
| update | what is the CI runner currently | the CI runner was CircleCI |
| update | what is the metrics backend currently | the metrics backend was Graphite |
| update | what is the deploy target currently | the deploy target was EC2 |
| temporal | where is headquarters currently | Headquarters is in Berlin |

## Notes / caveats

- Same labelled harness as `eval:bench` (`packages/backend/eval/*`). Not the synthetic `tests/memory/benchmark/retrieve.bench.test.ts` toy.
- Product retrieve is default-on when `TYPESAFE_API_KEY` is set (PR #183). Eval disables with harness-only `judge: "off"`.
- Default-on over-fetches 20 hits, Jev judges that head, eval slices to k=10. Threshold **0.5** keeps near-ties; live smoke gold was 0.66 and traps 0.03.
- Jev is weak at date math — temporal windows still come from `temporal.ts`.
- Missing `TYPESAFE_API_KEY` on retrieve in prod fail-opens to hybrid. This labelled comparison **requires** a live key.
- Embeddings are synthetic unless `OPENROUTER_API_KEY` is set. Jev judges title/content, so the embedder only changes the hybrid head it sees.
- Token usage is whatever System One returned; dollar cost is not inferred.
