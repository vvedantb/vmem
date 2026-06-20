# vmem LoCoMo benchmark results

Run id: `smoke-free` · Generated: 2026-06-14 · Conversations: 1

## Measured results (one judge, all rows comparable)

Headline metric is **LLM-judge accuracy (J)** — the fraction of questions the
judge marked correct. "Ctx tokens" is mean context fed to the answer model per
question (chars/4 approximation); lower is cheaper. Search latency is the
retrieval call only.

| Provider     | Overall J        | temporal | open-domain | Ctx tokens | Search p50 | Search p95 |
| ------------ | ---------------- | -------- | ----------- | ---------- | ---------- | ---------- |
| vmem         | **66.7%** (2/3)  | 50.0%    | 100.0%      | 342        | 229ms      | 408ms      |
| full-context | **100.0%** (3/3) | 100.0%   | 100.0%      | 2414       | 0ms        | 0ms        |

## Methodology

- **Benchmark:** LoCoMo (snap-research). Adversarial category 5 excluded, matching mem0's methodology.
- **Answer model:** `openai/gpt-oss-20b:free` · **Judge model:** `openai/gpt-oss-120b:free` · **vmem memory model:** `openai/gpt-oss-20b:free` (all via OpenRouter).
- **Answer + judge prompts:** adapted from `mem0ai/memory-benchmarks` (paraphrased, not verbatim — the upstream prompts are the methodology reference). The SAME prompts grade every provider, so absolute J depends on the judge but the ranking between systems does not.
- **Embeddings:** `text-embedding-3-small` (vmem's production model).
- **vmem path:** production engine code — bench extraction → per-fact hybrid retrieval → ADD/UPDATE/DELETE/NONE decision → engine create/update/delete with dedup → production enrichment (tags/entities/RELATES_TO). QA-time retrieval is the unmodified production `retrieveMemories` (RRF fusion, graph expansion, MMR).

### Deviations from production (vmem row)

- LLM calls via the CLI OpenRouter client, not Convex `callJsonChat` (same prompts/models).
- UPDATE/DELETE proposals auto-applied (no human review step).
- Bench-specific multi-speaker extraction prompt (production is single-user, first-person).
- No Convex scheduler — extraction → decision → enrichment run inline; session dates are baked into fact text because `createMemory` stamps `createdAt = now`.

### Caveats

- Latency reflects vmem on Neo4j Aura from a single CLI process; vendor latency figures come from their production infra and are not directly comparable.
- Context-token counts use a chars/4 approximation, consistent across providers.

## Published vendor numbers (NOT comparable to the table above)

These are self-reported by each vendor under their own answer model + judge +
methodology. They are included for context only — different judges produce
different absolute scores, so they cannot be placed in the same table as the
measured rows. The whole point of the harness above is to compare under ONE judge.

| System           | Benchmark     | Reported                              | Source                                       |
| ---------------- | ------------- | ------------------------------------- | -------------------------------------------- |
| Mem0             | LoCoMo        | ~66% (J), SOTA claims vary by version | Mem0 paper, arXiv 2504.19413                 |
| Mem0 Platform v3 | LongMemEval   | 94.4%                                 | github.com/mem0ai/memory-benchmarks          |
| Supermemory      | LongMemEval-S | 95% (Recall@15)                       | supermemory.ai/research/longmembench         |
| ByteRover 2.0    | LoCoMo        | 92.2%                                 | byterover.dev/blog/benchmark-ai-agent-memory |
| Mastra           | LongMemEval   | 95%                                   | mastra.ai/research/observational-memory      |

LoCoMo and LongMemEval are different benchmarks; cross-benchmark comparison is
not meaningful either.
