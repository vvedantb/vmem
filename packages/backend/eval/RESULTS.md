# Temporal boost + threshold + optional rerank

Generated: 2026-09-17 · Embeddings: synthetic (no `OPENROUTER_API_KEY`) · Convex-only IR, no LLM judge.

Rebased onto `main` after #176 (index candidate pool) and #178 (instruction supersede). Temporal fields still persist at write; retrieve classifies `last week` / `currently` / ISO dates with rules (`referenceDate` for eval). Additive temporal leg (`+ 0.22 * temporal`). Optional `threshold` and top-20 `rerank` keep `scoreBreakdown` / Context Trace. Instruction add/update still supersedes via #178 and now copies extract temporal fields onto new rows.

## Before / after

Labelled before: `tests/mcp/RESULTS.md` (488 memories, 78 answerable). Hard before: `HARD_FULL_HYBRID_BEFORE` in `benchmark.ts` (pre-#175).

| Suite                     | Metric                      | Before  | After             | Notes                                      |
| ------------------------- | --------------------------- | ------- | ----------------- | ------------------------------------------ |
| Labelled full hybrid      | recall@5                    | 99.4%   | **100.0%**        | Neo4j bar 92.0%; index pool + temporal     |
| Labelled full hybrid      | MRR                         | 0.994   | **0.988**         | Neo4j bar 0.974; 3 harder temporal queries |
| Labelled full hybrid      | nDCG@10                     | 0.968   | **0.975**         | Neo4j bar 0.857                            |
| Labelled temporal nDCG@10 | hybrid (no temporal) → full | —       | **0.780 → 1.000** | Same-age last-week vs yesterday            |
| Labelled abstention       | top score                   | ungated | **all 6 < 0.8**   | `threshold: 0.8` would return `[]`         |
| Hard full hybrid          | recall@5                    | 78.1%   | **96.8%**         | vs pre-#175; same overall as #175          |
| Hard full hybrid          | MRR                         | 0.703   | **0.901**         |                                            |
| Hard full hybrid          | nDCG@10                     | 0.674   | **0.920**         |                                            |
| Hard temporal nDCG@10     | hybrid (no temporal) → full | —       | **0.815 → 1.000** |                                            |

Full tables: `labelled-bench.md`, `hard-bench.md`. Re-run: `pnpm --filter @vmem/backend eval:bench` and `eval:hard`.

Hybrid vs TypeSafe Jev on the same labelled harness (main result = default-on Jev; control = `judge: "off"`): `tests/memory/benchmark/jev-gate-results.md`. Re-run: `EVAL_JEV=1 pnpm --filter @vmem/backend eval:jev` (live System One; no mock).
