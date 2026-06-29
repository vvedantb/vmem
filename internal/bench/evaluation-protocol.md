# vmem effectiveness evaluation — external-benchmark protocol (ARCHIVED)

> **Archived.** This records the external-benchmark protocol (LoCoMo /
> LongMemEval / BEAM) that was investigated. The harness **code and all
> `bench:*` / PowerShell commands were removed** — they no longer exist. It is
> kept only as a record of what was tried.
>
> - **Current evaluation** (the submission story): `pnpm db:seed:bench` →
>   `pnpm eval:bench` → [`vmem-internal-eval.md`](./vmem-internal-eval.md), plus
>   the behavioural suite `pnpm test:behavioral`.
> - **Why external benchmarks are not the primary path:**
>   [`external-benchmarks-investigation.md`](./external-benchmarks-investigation.md).
> - **Recorded results:** [`locomo-results.md`](./locomo-results.md),
>   [`beam-results.md`](./beam-results.md).

## What the protocol was

The vendor pattern (Mem0 / Supermemory): the memory system **retrieves** →
a reader LLM **answers** → a fixed LLM **judge** scores the answer against a gold
reference → absolute judge accuracy (J), with a full-context oracle ceiling and
no no-memory arm. One harness mapped LoCoMo, LongMemEval-S and BEAM into a shared
conversation shape.

| Knob       | Setting (as run)                                                 |
| ---------- | ---------------------------------------------------------------- |
| Arms       | `vmem` (production `retrieveMemories`) + `full-context` (oracle) |
| Reader     | Claude `sonnet` via the CLI (Max-plan quota)                     |
| Judge      | `gpt-4o-mini` via OpenRouter (fixed)                             |
| Ingest     | vmem full pipeline on a free model; both user + assistant turns  |
| Isolation  | per-conversation synthetic `userId` (no cross-item leakage)      |
| Abstention | graded by an abstention-aware judge, reported separately         |

**Comparability caveat:** absolute J was only _directionally_ comparable, never
leaderboard parity — a Claude reader + gpt-4o-mini judge against the vendors'
different reader/judge, a different memory system, and (for LongMemEval) only a
slice. This conflation of retrieval quality with reader/judge behaviour, plus the
cost of running at publishable scale on a Max-plan budget, is why the project
moved to the internal embeddings+Neo4j evaluation instead.
