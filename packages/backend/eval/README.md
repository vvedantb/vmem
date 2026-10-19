# Backend evals

Commands run from the repo root. Unit tests for every harness run in `pnpm test` and use no network.

| Command                                                           | What it measures                                       | LLM?                                                           | Gate                      |
| ----------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- | ------------------------- |
| `pnpm --filter @vmem/backend eval:bench`                          | Labelled IR (recall@k, MRR, nDCG) on the static corpus | No                                                             | none                      |
| `pnpm --filter @vmem/backend eval:hard`                           | Harder labelled corpus, tail and temporal cases        | No                                                             | none                      |
| `pnpm --filter @vmem/backend eval:perf`                           | Wall-clock p95 budget (100 ms) for the index pool      | No                                                             | `EVAL_PERF`               |
| `EVAL_JEV=1 pnpm --filter @vmem/backend eval:jev`                 | Default-on Jev rerank vs hybrid-only                   | Yes (AI Gateway, needs `AI_GATEWAY_API_KEY`)                   | `EVAL_JEV`                |
| `EVAL_COMPETITIVE=1 pnpm --filter @vmem/backend eval:competitive` | Labelled IR vs Mem0 and SuperMemory                    | Third-party APIs (needs `MEM0_API_KEY`, `SUPERMEMORY_API_KEY`) | `EVAL_COMPETITIVE`        |
| `pnpm --filter @vmem/backend eval:locomo-ir`                      | LoCoMo utterance IR (`LOCOMO_IR_JUDGE=jev` adds Jev)   | No by default                                                  | `EVAL_LOCOMO_IR`          |
| `EVAL_E2E_AB=1 pnpm --filter @vmem/backend eval:e2e-ab`           | Memory on/off A/B with headless `claude -p`            | Yes (`claude` agent and judge)                                 | `EVAL_E2E_AB`, local only |

`eval:bench`, `eval:hard` and `eval:perf` pin `Date` and use synthetic embeddings, so `pnpm test` is offline and repeatable. `EVAL_EMBEDDINGS=gateway` opts in to AI Gateway embeddings (needs `AI_GATEWAY_API_KEY`). In `pnpm test` these heavy files run after the unit tests (vitest project `eval`). Their per-query cost check counts ranked memories (`poolMax` ≤ the 384 rank-pool cap), not milliseconds.

`eval:e2e-ab -- --dry-run` loads fixtures and writes `result.json` with no LLM and no HTTP.

Results: `RESULTS.md`. Details for the e2e A/B harness: `e2e-ab/README.md` and `docs/e2e-ab-eval.md`.
