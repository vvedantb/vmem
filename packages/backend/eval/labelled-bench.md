# vmem Convex retrieval eval

Generated: 2026-09-17 · Corpus: 493 memories · Answerable queries: 81 · Abstention queries: 6 · Embeddings: synthetic

## Retrieval quality + ablation (Convex ranker, per-leg toggles)

| Config               | recall@1 | recall@3 | recall@5 | recall@10 | P@5   | MRR   | nDCG@10 | ctx tok | p50 ms | p95 ms |
| -------------------- | -------- | -------- | -------- | --------- | ----- | ----- | ------- | ------- | ------ | ------ |
| vector-only          | 74.1%    | 88.3%    | 89.5%    | 90.1%     | 24.9% | 0.981 | 0.879   | 282     | 26     | 31     |
| bm25-only            | 74.1%    | 90.4%    | 93.2%    | 94.1%     | 33.0% | 0.981 | 0.865   | 218     | 22     | 27     |
| hybrid (no graph)    | 75.3%    | 88.3%    | 91.7%    | 93.2%     | 26.2% | 0.988 | 0.892   | 277     | 48     | 58     |
| hybrid (no temporal) | 74.1%    | 96.9%    | 99.7%    | 100.0%    | 31.9% | 0.981 | 0.966   | 284     | 46     | 49     |
| full hybrid          | 75.3%    | 96.3%    | 99.7%    | 100.0%    | 31.9% | 0.988 | 0.974   | 279     | 47     | 49     |

## nDCG@10 by query type

| type         | n   | vector-only | bm25-only | hybrid (no graph) | hybrid (no temporal) | full hybrid |
| ------------ | --- | ----------- | --------- | ----------------- | -------------------- | ----------- |
| single-fact  | 12  | 1.000       | 1.000     | 1.000             | 1.000                | 1.000       |
| preference   | 10  | 1.000       | 1.000     | 1.000             | 1.000                | 1.000       |
| exact-match  | 12  | 1.000       | 1.000     | 1.000             | 1.000                | 1.000       |
| project      | 8   | 0.599       | 0.658     | 0.677             | 0.995                | 0.995       |
| lexical-trap | 12  | 0.969       | 1.000     | 0.969             | 0.969                | 0.969       |
| update       | 12  | 1.000       | 0.782     | 0.998             | 1.000                | 0.998       |
| multi-hop    | 12  | 0.536       | 0.622     | 0.522             | 0.862                | 0.862       |
| temporal     | 3   | 0.780       | 0.657     | 1.000             | 0.780                | 1.000       |

## Recall@5 by query type

| type         | n   | vector-only | bm25-only | hybrid (no graph) | hybrid (no temporal) | full hybrid |
| ------------ | --- | ----------- | --------- | ----------------- | -------------------- | ----------- |
| single-fact  | 12  | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| preference   | 10  | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| exact-match  | 12  | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| project      | 8   | 25.0%       | 31.3%     | 34.4%             | 96.9%                | 96.9%       |
| lexical-trap | 12  | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| update       | 12  | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| multi-hop    | 12  | 79.2%       | 100.0%    | 87.5%             | 100.0%               | 100.0%      |
| temporal     | 3   | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |

## vs Neo4j full hybrid (2026-07-18, OpenRouter embeddings)

Success bar: Convex full hybrid ≥ Neo4j on recall@5, MRR, and nDCG@10.

| Metric    | Neo4j full hybrid | Convex full hybrid | Δ      |
| --------- | ----------------- | ------------------ | ------ |
| recall@1  | 72.4%             | 75.3%              | +2.9%  |
| recall@3  | 90.1%             | 96.3%              | +6.2%  |
| recall@5  | 92.0%             | 99.7%              | +7.7%  |
| recall@10 | 93.3%             | 100.0%             | +6.7%  |
| P@5       | 26.4%             | 31.9%              | +5.5%  |
| MRR       | 0.974             | 0.988              | +0.014 |
| nDCG@10   | 0.857             | 0.974              | +0.117 |

### Ablation vs the same Neo4j run

| Config               | Neo4j R@5 | Convex R@5 | Neo4j MRR | Convex MRR | Neo4j nDCG@10 | Convex nDCG@10 |
| -------------------- | --------- | ---------- | --------- | ---------- | ------------- | -------------- |
| vector-only          | 91.7%     | 89.5%      | 0.971     | 0.981      | 0.841         | 0.879          |
| bm25-only            | 84.0%     | 93.2%      | 0.913     | 0.981      | 0.792         | 0.865          |
| hybrid (no graph)    | 91.7%     | 91.7%      | 0.981     | 0.988      | 0.852         | 0.892          |
| hybrid (no temporal) | —         | 99.7%      | —         | 0.981      | —             | 0.966          |
| full hybrid          | 92.0%     | 99.7%      | 0.974     | 0.988      | 0.857         | 0.974          |

## Notes

- Legs: `vector-only` / `bm25-only` are naive single-channel baselines (temporal off). `hybrid (no graph)` is lexical+vector+recency+temporal. `hybrid (no temporal)` is full hybrid without the event-window leg. `full hybrid` adds stored memory links (up to 2 hops) as a second pass.
- Query types: **single-fact / preference** one clear answer. **exact-match** distinctive codes among lookalikes. **project** sibling facts that never repeat the codename. **lexical-trap** repeats a query keyword in a different sense (graded 0). **update** stale vs current, recency separates them. **multi-hop** gold is one stored link from a bridge that shares the query entity. **temporal** event windows / currently vs same-age stale, not list order.
- Pure retrieval metrics + latency. No LLM judge. Neo4j is not used.
- Convex numbers in this environment use deterministic synthetic embeddings unless `AI_GATEWAY_API_KEY` is set. The Neo4j 2026-07-18 bar used OpenRouter `text-embedding-3-small`.
