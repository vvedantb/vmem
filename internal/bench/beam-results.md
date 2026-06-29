# vmem BEAM 100K benchmark results

> **Archived results.** The benchmark harness that produced these was removed;
> any `bench:*` commands referenced below no longer exist. Kept for history. The
> current evaluation is the internal benchmark — see
> [`vmem-internal-eval.md`](./vmem-internal-eval.md) and
> [`external-benchmarks-investigation.md`](./external-benchmarks-investigation.md).

> ⚠️ **DIRECTIONALLY COMPARABLE ONLY.** Reader = `claude:sonnet`, judge = `openai/gpt-4o-mini` — not the vendors' gpt-4o-mini reader + gpt-4o judge, so these numbers do **not** claim strict leaderboard parity with Mem0 / Supermemory.

Run id: `beam-combined` · Generated: 2026-06-29 · Conversations: 1

## Measured results (one judge, all rows comparable)

Headline metric is **LLM-judge accuracy (J)** over ANSWERABLE questions — the
fraction the judge marked correct. "Ctx tokens" is mean context fed to the reader
per question (chars/4 approximation); lower is cheaper. Search latency is the
retrieval call only.

| Provider     | Overall J        | contradiction_resolution | event_ordering | information_extraction | knowledge_update | multi_session_reasoning | summarization | temporal_reasoning | Ctx tokens | Search p50 | Search p95 |
| ------------ | ---------------- | ------------------------ | -------------- | ---------------------- | ---------------- | ----------------------- | ------------- | ------------------ | ---------- | ---------- | ---------- |
| vmem         | **42.9%** (6/14) | 50.0%                    | 0.0%           | 50.0%                  | 100.0%           | 50.0%                   | 50.0%         | 0.0%               | 411        | 2009ms     | 3999ms     |
| full-context | **64.3%** (9/14) | 50.0%                    | 0.0%           | 50.0%                  | 100.0%           | 100.0%                  | 100.0%        | 50.0%              | 131463     | 0ms        | 0ms        |

**vmem = 66.7% of the full-context oracle.**

## Abstention (abstention-aware judge — correct ⇔ the model declines)

| Provider     | Abstention accuracy | Correct |
| ------------ | ------------------- | ------- |
| vmem         | **50.0%**           | 1 / 2   |
| full-context | **0.0%**            | 0 / 2   |

## Methodology

- **Benchmark:** BEAM (Mohammadta/BEAM, 100K split). 8 of 10 abilities are gold-answer graded; instruction_following + preference_following are rubric-graded and excluded.
- **Protocol (vendor-style):** controlled `retrieveMemories` top-k → reader answers → fixed judge. Reader = `claude:sonnet`, judge = `openai/gpt-4o-mini`, vmem ingest model = `openai/gpt-4o-mini`.
- **Arms:** `vmem` (production retrieval) and `full-context` (oracle ceiling). No no-memory arm (vendors do not use one).
- **vmem path:** production engine — bench extraction → per-fact hybrid retrieval → ADD/UPDATE/DELETE/NONE decision → engine create/update/delete with dedup → enrichment (tags/entities/RELATES_TO). QA-time retrieval is the unmodified production `retrieveMemories`.
- **Isolation:** each conversation ingests under its own synthetic `userId`, so retrieval cannot leak across items.
- **Comparability:** absolute J is **not** comparable to the official leaderboard — different judge (binary LLM-judge vs the vendors' gpt-4o / F1), reader, and (for LongMemEval) only a slice. The within-run ranking (vmem vs oracle) is the measured result.

## Published vendor numbers (NOT comparable to the table above)

These are self-reported by each vendor under their OWN reader + judge + methodology. Our numbers use a `claude:sonnet` reader and a `openai/gpt-4o-mini` judge (the vendors use a gpt-4o-mini reader + gpt-4o judge), so absolute scores are **directionally comparable, not strict apples-to-apples**.

| System           | Benchmark     | Reported        | Source                                       |
| ---------------- | ------------- | --------------- | -------------------------------------------- |
| Mem0             | LoCoMo        | ~66% (J)        | Mem0 paper, arXiv 2504.19413                 |
| Mem0 Platform v3 | LongMemEval   | 94.4%           | github.com/mem0ai/memory-benchmarks          |
| Supermemory      | LongMemEval-S | 95% (Recall@15) | supermemory.ai/research/longmembench         |
| ByteRover 2.0    | LoCoMo        | 92.2%           | byterover.dev/blog/benchmark-ai-agent-memory |

LoCoMo, LongMemEval, and BEAM are different benchmarks; cross-benchmark comparison is not meaningful either.
