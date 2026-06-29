# External memory benchmarks: investigated, not used as primary evaluation

This note records why the public long-term-memory benchmarks (LoCoMo,
LongMemEval, BEAM) were investigated but are **not** the primary evaluation for
this project. The primary, reproducible evaluation is the internal retrieval
benchmark under `packages/backend/neo4j-cli/eval/` — see
[`vmem-internal-eval.md`](./vmem-internal-eval.md).

## What was investigated

| Benchmark     | What it measures                            | Protocol                                                          |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| LoCoMo        | multi-session conversational QA             | memory retrieves → reader answers → LLM judge scores against gold |
| LongMemEval-S | long-horizon memory QA (500 items)          | same retrieve–read–judge shape                                    |
| BEAM          | 10-ability memory probing (100K–10M tokens) | same shape, with a full-context oracle ceiling                    |

All three follow the vendor pattern used by Mem0 and Supermemory: the memory
system retrieves context, a reader LLM answers, and a fixed LLM judge marks the
answer against a gold reference, reported as absolute judge accuracy.

## Why they are not the primary evaluation

1. **Infeasible to run at publishable scale on the available budget.** The only
   LLM budget here is a personal Claude Max plan (subsidised, rate-limited),
   not the metered API spend the vendors use. Our runs and estimates put a full
   pass well beyond what that allows: LongMemEval-S ingest is roughly 20k
   provider calls / about 10 hours on the full pipeline; LoCoMo's ~1,540
   questions is ~1,540 reader calls spanning several 5-hour quota windows; the
   BEAM full-context oracle is roughly $19 per conversation. Partial slices
   (e.g. a 50-item LongMemEval sample, a 3-conversation BEAM slice) are not
   defensible as headline results.

2. **The judged-answer step conflates retrieval quality with reader and judge
   behaviour.** Absolute judge accuracy mixes the memory system's contribution
   with the reader model, the judge model, and prompt wording. It is a weak
   signal for the thing this project actually changes — what gets retrieved.

3. **Cross-system numbers are only directionally comparable, never leaderboard
   parity.** We would use a different reader, a different judge, a different
   memory system, and (for LongMemEval) only a slice, against the vendors'
   undisclosed or differently-configured setups. Our own partial BEAM-100K run,
   for example, sat below the full-context oracle and was not comparable to
   Mem0's published BEAM figure (a different split, full conversations, a
   different protocol). Vendor figures (Mem0, Supermemory, and others' internal
   evaluations) are therefore context only, not measured baselines.

## What is used instead

A custom internal benchmark that isolates exactly what vmem changes —
**retrieval quality, token efficiency, latency, and the differentiator
behaviours** — using only embeddings and Neo4j, with no reader or judge LLM. It
is cheap, fast, and fully reproducible on every change:

- `pnpm db:seed:bench` then `pnpm eval:bench` — the ablation report
  ([`vmem-internal-eval.md`](./vmem-internal-eval.md)): recall@k, precision,
  MRR, nDCG@10, token efficiency and latency, broken out by query type, across
  naive baselines (vector-only, BM25-only) and the full hybrid pipeline.
- `pnpm test:behavioral` — the deterministic differentiator suite (dedup,
  suppress/pin lifecycle, Context Trace, proposed-update supersession).

This validates the system's stated value propositions directly, which the
third-party leaderboards never did, and it runs in minutes rather than days.
