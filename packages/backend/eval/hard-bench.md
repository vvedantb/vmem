# vmem Convex hard retrieval eval

Generated: 2026-09-17 · Corpus: 350 memories · Answerable queries: 42 · Embeddings: synthetic

## Retrieval quality + ablation

| Config               | recall@1 | recall@3 | recall@5 | recall@10 | P@5   | MRR   | nDCG@10 |
| -------------------- | -------- | -------- | -------- | --------- | ----- | ----- | ------- |
| vector-only          | 68.7%    | 84.9%    | 85.7%    | 88.1%     | 24.9% | 0.821 | 0.770   |
| bm25-only            | 80.6%    | 92.1%    | 93.7%    | 95.2%     | 35.4% | 0.917 | 0.853   |
| hybrid (no graph)    | 78.2%    | 92.1%    | 92.1%    | 94.4%     | 25.9% | 0.901 | 0.846   |
| hybrid (no temporal) | 73.4%    | 96.0%    | 96.8%    | 98.4%     | 28.7% | 0.877 | 0.903   |
| full hybrid          | 78.2%    | 96.0%    | 96.8%    | 98.4%     | 28.7% | 0.901 | 0.920   |

## nDCG@10 by query type

| type         | n   | vector-only | bm25-only | hybrid (no graph) | hybrid (no temporal) | full hybrid |
| ------------ | --- | ----------- | --------- | ----------------- | -------------------- | ----------- |
| paraphrase   | 12  | 0.719       | 1.000     | 0.928             | 0.928                | 0.928       |
| long-tail    | 5   | 1.000       | 1.000     | 1.000             | 1.000                | 1.000       |
| multi-hop-2  | 6   | 0.136       | 0.139     | 0.128             | 0.647                | 0.647       |
| tag-conflict | 3   | 0.877       | 1.000     | 0.877             | 0.877                | 0.877       |
| tag-filter   | 2   | 1.000       | 1.000     | 1.000             | 1.000                | 1.000       |
| type-intent  | 1   | 1.000       | 1.000     | 1.000             | 1.000                | 1.000       |
| type-filter  | 3   | 1.000       | 1.000     | 1.000             | 1.000                | 1.000       |
| distractor   | 6   | 1.000       | 1.000     | 1.000             | 1.000                | 1.000       |
| temporal     | 4   | 0.815       | 0.743     | 1.000             | 0.815                | 1.000       |

## Recall@5 by query type

| type         | n   | vector-only | bm25-only | hybrid (no graph) | hybrid (no temporal) | full hybrid |
| ------------ | --- | ----------- | --------- | ----------------- | -------------------- | ----------- |
| paraphrase   | 12  | 75.0%       | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| long-tail    | 5   | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| multi-hop-2  | 6   | 50.0%       | 55.6%     | 44.4%             | 77.8%                | 77.8%       |
| tag-conflict | 3   | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| tag-filter   | 2   | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| type-intent  | 1   | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| type-filter  | 3   | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| distractor   | 6   | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |
| temporal     | 4   | 100.0%      | 100.0%    | 100.0%            | 100.0%               | 100.0%      |

## vs previous Convex full hybrid on this suite

| Metric   | Before | After | Δ      |
| -------- | ------ | ----- | ------ |
| recall@5 | 78.1%  | 96.8% | +18.7% |
| MRR      | 0.703  | 0.901 | +0.198 |
| nDCG@10  | 0.674  | 0.920 | +0.246 |

## Notes

- Query types: **paraphrase** shares little surface form with gold. **long-tail** near-duplicate entity names. **multi-hop-2** gold is two stored links from the query entity. **tag-conflict** staging vs production. **tag-filter / type-filter** apply retrieve filters. **type-intent** must prefer profile without a filter. **distractor** recent keyword traps. **temporal** last-week vs yesterday and currently vs same-age stale.
- Convex-only. No Neo4j. No LLM judge.
