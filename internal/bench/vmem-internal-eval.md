# vmem internal retrieval benchmark

Generated: 2026-06-29 · Corpus: 488 memories · Answerable queries: 78 · Abstention queries: 6 · Embeddings: openrouter

## Retrieval quality + ablation (production `retrieveMemories`, per-leg toggles)

| Config            | recall@1 | recall@3 | recall@5 | recall@10 | P@5   | MRR   | nDCG@10 | ctx tok | p50 ms | p95 ms |
| ----------------- | -------- | -------- | -------- | --------- | ----- | ----- | ------- | ------- | ------ | ------ |
| vector-only       | 69.2%    | 86.5%    | 91.7%    | 92.3%     | 25.9% | 0.958 | 0.831   | 288     | 95     | 124    |
| bm25-only         | 52.6%    | 77.6%    | 80.8%    | 87.2%     | 39.3% | 0.809 | 0.744   | 212     | 87     | 115    |
| hybrid (no graph) | 69.2%    | 87.2%    | 91.7%    | 92.3%     | 25.9% | 0.952 | 0.825   | 277     | 149    | 226    |
| hybrid (no dedup) | 67.9%    | 89.1%    | 93.3%    | 95.2%     | 27.4% | 0.939 | 0.836   | 289     | 191    | 274    |
| full hybrid       | 67.9%    | 89.1%    | 93.3%    | 95.2%     | 27.4% | 0.939 | 0.836   | 283     | 198    | 268    |

## nDCG@10 by query type

| type         | n   | vector-only | bm25-only | hybrid (no graph) | hybrid (no dedup) | full hybrid |
| ------------ | --- | ----------- | --------- | ----------------- | ----------------- | ----------- |
| single-fact  | 12  | 0.969       | 0.754     | 0.897             | 0.897             | 0.897       |
| preference   | 10  | 1.000       | 0.789     | 1.000             | 1.000             | 1.000       |
| exact-match  | 12  | 0.860       | 1.000     | 1.000             | 1.000             | 1.000       |
| project      | 8   | 0.599       | 0.599     | 0.599             | 0.743             | 0.743       |
| lexical-trap | 12  | 0.969       | 0.786     | 0.869             | 0.869             | 0.869       |
| update       | 12  | 0.782       | 0.969     | 0.781             | 0.781             | 0.781       |
| multi-hop    | 12  | 0.589       | 0.270     | 0.580             | 0.557             | 0.557       |

## Recall@5 by query type

| type         | n   | vector-only | bm25-only | hybrid (no graph) | hybrid (no dedup) | full hybrid |
| ------------ | --- | ----------- | --------- | ----------------- | ----------------- | ----------- |
| single-fact  | 12  | 100.0%      | 91.7%     | 100.0%            | 100.0%            | 100.0%      |
| preference   | 10  | 100.0%      | 90.0%     | 100.0%            | 100.0%            | 100.0%      |
| exact-match  | 12  | 100.0%      | 100.0%    | 100.0%            | 100.0%            | 100.0%      |
| project      | 8   | 25.0%       | 25.0%     | 25.0%             | 46.9%             | 46.9%       |
| lexical-trap | 12  | 100.0%      | 91.7%     | 100.0%            | 100.0%            | 100.0%      |
| update       | 12  | 100.0%      | 100.0%    | 100.0%            | 100.0%            | 100.0%      |
| multi-hop    | 12  | 95.8%       | 50.0%     | 95.8%             | 91.7%             | 91.7%       |

## Token efficiency

Full corpus ≈ **16384** tokens. Full-hybrid retrieval feeds ≈ **283** tokens/query — about **58× less** context than stuffing the whole corpus into the prompt.

## Abstention signal

Top-1 fused score on answerable vs no-answer queries. A lower abstention score means retrieval is less confident when nothing relevant exists (a threshold here is what the QA layer would use to abstain).

| Config            | answerable top-1 score | abstention top-1 score |
| ----------------- | ---------------------- | ---------------------- |
| vector-only       | 0.027                  | 0.016                  |
| bm25-only         | 0.012                  | 0.013                  |
| hybrid (no graph) | 0.039                  | 0.034                  |
| hybrid (no dedup) | 0.039                  | 0.034                  |
| full hybrid       | 0.039                  | 0.034                  |

## Notes

- Single-leg rows (`vector-only`, `bm25-only`) are naive baselines with dedup off — raw leg ranking. `hybrid (no graph)` isolates the graph contribution, `hybrid (no dedup)` the dedup contribution; `full hybrid` is the production path.
- Query types: **single-fact / preference** have one clear answer (embeddings handle these). **exact-match** is a distinctive code among near-identical lookalikes, query gives only the code — embeddings blur similar codes, so the BM25/fulltext leg lifts the hybrid above vector here. **project** is a related cluster whose sibling facts never repeat the anchor codename — tests associative recall via graph expansion. **lexical-trap** repeats the query keyword in a different sense (graded 0), penalising BM25. **update** has a stale + current memory, recency separates them. **multi-hop** puts the gold one RELATES_TO hop from a strong bridge, sharing only a faint word with the query.
- **Fusion was retuned after this benchmark exposed two flaws** (`engine/neo4j/memory/retrieve.ts`): before tuning full hybrid scored nDCG@10 ≈ 0.69 — below pure vector — because recency/confidence were a flat additive boost that swamped the tiny RRF relevance scores (retrieval effectively sorted by recency), and MMR's diversity penalty demoted genuinely-related cluster members. Fixes: per-leg RRF weights (favour vector, down-weight BM25), recency/confidence as a bounded relevance multiplier, and MMR replaced by near-duplicate-only suppression. The graph leg is net-positive post-tuning (largest gain on `project`).
- Pure retrieval metrics + latency — no LLM answer/judge. recall@k = fraction of labelled-relevant memories in top-k; nDCG@10 over graded relevance (binary where grades absent).
- Latency is single-process wall-clock against the eval Neo4j; not directly comparable to production infra.
