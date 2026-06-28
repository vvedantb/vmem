# vmem effectiveness evaluation (publishable protocol)

**Goal:** reproducible numbers for “does vmem help?” that you can share without
vendor-grade hand-waving.

## What we measure

| Row              | Meaning                                      | Analogue                                       |
| ---------------- | -------------------------------------------- | ---------------------------------------------- |
| **no-memory**    | Answer model sees **no** retrieved context   | Claude / ChatGPT **without** vmem MCP          |
| **vmem**         | Production ingest + `retrieveMemories` top-k | Claude **with** vmem connector                 |
| **full-context** | Entire LoCoMo transcript in context          | Oracle ceiling (not a fair “no vmem” baseline) |

**Primary metric:** **J** — LLM-judge accuracy on [LoCoMo](https://github.com/snap-research/locomo)
(non-adversarial categories only). Same answer + judge models for every row.

**Secondary metrics:**

- **Context tokens** (chars/4) — cost of memory at answer time
- **Search latency** p50/p95 — retrieval speed (vmem only)
- **Per-category J** — multi-hop, temporal, open-domain, single-hop

## How to run (CLI harness)

From `packages/backend` (needs `NEO4J_*` + `OPENROUTER_API_KEY` in `.env.local`):

```bash
pnpm bench:download   # once
pnpm bench:locomo \
  --run-id publish-2026-06-28 \
  --providers no-memory,vmem,full-context \
  --conversations 10 \
  --fast-ingest \
  --memory-model openai/gpt-4.1-nano \
  --answer-model openai/gpt-4.1-nano \
  --judge-model openai/gpt-4.1-mini

pnpm bench:report --run-id publish-2026-06-28
# → internal/bench/locomo-results.md

pnpm bench:cleanup   # remove synthetic bench_locomo_* users
```

**Smoke (rate-limit friendly):**

```bash
pnpm bench:locomo \
  --run-id smoke-1 \
  --conversations 1 --max-sessions 2 --max-questions 5 \
  --providers no-memory,vmem,full-context --fast-ingest
```

Resume after interruption: same `--run-id` + `--resume`.

## What to publish

Copy the **measured table** from `locomo-results.md`. Lead with:

1. **vmem vs no-memory** — absolute J lift + token savings vs full-context
2. **Methodology** — one shared judge, public dataset, open harness in this repo
3. **Caveats** — bench uses CLI engine path (not MCP wire format); ingest uses
   production extraction/decision/enrichment; category 5 excluded

Put vendor claims (Mem0, Supermemory, OpenAI “Dreaming”, etc.) in a **separate
cited section** — see `comparator-claims.md`. Never mix with measured rows.

## Claude Code MCP spot-check (optional, qualitative)

LoCoMo is the quantitative backbone. For “feels like vmem in Claude”:

1. Ingest one LoCoMo conversation under a bench profile (`--user` / `--profile`).
2. **With MCP:** ask the same 5 questions; note tool calls (`memory_retrieve`).
3. **Without MCP:** new chat, same questions — no tools.
4. Log pass/fail manually; do not merge into J table (different answer model).

`claude -p "…"` can script the qualitative arm later; the harness above is the
shareable score.

## Improvement backlog

- [ ] Phase 2 comparators: mem0, supermemory (same harness + judge)
- [ ] Multi-seed runs + confidence intervals on J
- [ ] Frozen model matrix in CI artifact
- [ ] MCP-path provider (Convex actions, not CLI) for production parity
