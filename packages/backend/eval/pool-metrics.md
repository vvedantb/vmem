# Retrieve candidate pool metrics

Generated: 2026-09-17 · Embeddings: synthetic (no `OPENROUTER_API_KEY`) · Convex-only, no Neo4j.

Production retrieve is no longer `last 200 ∪ 32 FTS ∪ 32 vectors`. Query retrieve unions Convex FTS (take 256, original + synonym batches of ≤16 terms) with `vectorSearch` (limit 256, platform max) and 2-hop `memoryLinks` neighbors, then ranks at most 384 docs. Recency listing is empty-query / related / index-miss fallback only.

## Tail gold (2000 memories, gold at recency rank 501)

Fixture: 60 high-TF occupiers outrank gold on FTS/vector; gold is older than the last-200 window. Exact title `"Amberhelix passphrase"`.

| Pool                                               | Gold in candidates | Recall@5     |
| -------------------------------------------------- | ------------------ | ------------ |
| legacy last 200 ∪ 32 FTS ∪ 32 vectors              | miss               | 0            |
| index FTS 256 ∪ vector 256 ∪ 2-hop links (cap 384) | hit                | 1.0 (rank 1) |

## Labelled corpus (488 memories, 78 answerable) — production-like pool then hybrid ranker

| Pool                                               | recall@1 | recall@5   | recall@10 | MRR   | nDCG@10 | p95 ms |
| -------------------------------------------------- | -------- | ---------- | --------- | ----- | ------- | ------ |
| legacy last 200 ∪ 32 FTS ∪ 32 vectors              | 75.0%    | 99.0%      | 100.0%    | 0.987 | 0.973   | 31     |
| index FTS 256 ∪ vector 256 ∪ 2-hop links (cap 384) | 75.0%    | **100.0%** | 100.0%    | 0.987 | 0.974   | 41     |

Full-corpus ranker (no candidate cap, same hybrid) still meets the Neo4j 2026-07-18 bar: R@5 100% ≥ 92.0%, MRR 0.987 ≥ 0.974, nDCG@10 0.974 ≥ 0.857.

## Hard suite (344 memories, 38 answerable) — production-like pool then hybrid ranker

| Pool                                               | recall@1 | recall@5 | recall@10 | MRR   | nDCG@10 | p95 ms |
| -------------------------------------------------- | -------- | -------- | --------- | ----- | ------- | ------ |
| legacy last 200 ∪ 32 FTS ∪ 32 vectors              | 79.8%    | 97.4%    | 100.0%    | 0.904 | 0.924   | 30     |
| index FTS 256 ∪ vector 256 ∪ 2-hop links (cap 384) | 77.2%    | 97.4%    | 100.0%    | 0.890 | 0.914   | 35     |

R@5 holds. MRR/nDCG dip slightly because the ranker no longer BM25-scores 200 unrelated recent rows (IDF/recency mix). Ranker p95 stays in-process-cheap; network FTS/vector dominate in production.
