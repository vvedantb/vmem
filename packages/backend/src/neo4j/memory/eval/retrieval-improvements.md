# Hybrid Retrieval Improvements

Date: 2026-05-22

## Delivered

1. Eval scaffold
   - Added `queries.ts` with 8 seed-derived retrieval checks.
   - Added `run.ts` to run `retrieveMemories`, print top 5 results, and compute recall@5 plus MRR.
   - Added `pnpm eval:retrieval`.
   - Saved `baseline.txt`.

2. Parallel retrieval legs
   - Fulltext, whole-memory vector, chunk vector, and entity overlap now run via separate Neo4j sessions.
   - The pipeline still avoids concurrent `session.run()` calls on one session.

3. Type-aware recency
   - Profile memories no longer decay.
   - Knowledge memories use the old buckets with a 0.2 lift capped at 1.0.
   - Episodic memories keep the old curve.

4. Graph RRF leg
   - Graph expansion now records hops, seed count, one seed id, and one bridging entity.
   - Graph candidates receive `graphRank` and join RRF with weight `0.85`.
   - Final scoring moved to `RRF * 0.55 + recency * 0.225 + confidence * 0.225`.
   - Trace output now includes graph path data for UI rendering.

5. Entity-match leg
   - Added entity overlap retrieval over `MENTIONS`.
   - Ranking uses rarity score when `memoryCount` exists, with a count-only fallback.
   - Query-side entity matching uses deterministic token and bigram candidates. No query LLM extractor existed, and this preserves the default no-extra-LLM-call requirement.

6. Query expansion flag
   - Added `VMEM_ENABLE_QUERY_EXPANSION`, default off.
   - When enabled, the Convex action uses the existing logged OpenRouter client to generate two paraphrases and embed them.
   - Expanded vector and chunk ranked lists are fused back into one vector rank and one chunk rank before final RRF.

7. MMR diversity
   - Added greedy MMR after scoring and before truncation.
   - It starts from the top-scoring candidate, then uses `0.7` relevance and `0.3` diversity.
   - It skips cleanly when the query embedding is missing.

8. Rerank flag
   - Added `VMEM_ENABLE_RERANK`, default off.
   - When enabled, the Convex action uses the existing logged OpenRouter chat client to score the top 30.
   - Parse or API failure logs and falls back to the pre-rerank order.
   - `rerankerScore` is surfaced in `scoreBreakdown`.

9. After eval
   - Saved `after.txt`.
   - Current local Neo4j does not contain the seed eval user memories, so both eval runs returned no candidates.

## Eval

Baseline:

- recall@5: `0.0000`
- MRR: `0.0000`

After:

- recall@5: `0.0000`
- MRR: `0.0000`

Delta:

- recall@5: `+0.0000`
- MRR: `+0.0000`

No metric improved in this local run because the seed-labelled eval user had no matching memories in the local Neo4j database. The saved files still preserve the harness and the measured result.

## Flags

- `VMEM_ENABLE_QUERY_EXPANSION`: default off.
- `VMEM_ENABLE_RERANK`: default off.

With both flags unset, retrieval makes no extra LLM calls beyond the existing query embedding path.

## Scope Notes

- No new dependencies were added.
- Convex schema and memory API trace validators were extended to accept the richer score breakdown.
- `runRetrieveMemories` now forwards `profileId` into the retrieval core so the existing profile filter actually applies.
