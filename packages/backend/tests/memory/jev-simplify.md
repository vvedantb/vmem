# Jev retrieve simplify

After [#182](https://github.com/vvedantb/vmem/pull/182) on clear-bear-690, fold Jev into default retrieve and drop overlapping second-stage ranking.

**Lock:** hybrid retrieve still generates candidates (`rank.ts` FTS + vector + graph + temporal). Jev is the second-stage **reranker** (score / best, no noul hard-drop) when `AI_GATEWAY_API_KEY` is set. GLiNER stays deferred.

Sibling: [jev-retrieve-gate.md](./jev-retrieve-gate.md). Research: [extraction-research-gliner-jev.md](./extraction-research-gliner-jev.md) (#181).

## Overlap map

| Path                                                                             | Job today                                            | vs Jev                                                                                                       | This PR                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hybrid candidate gen (`rank.ts` BM25 / phrase / RRF / vector / graph / temporal) | Pool + rank                                          | Complement. Jev is weak at date math; TypeSafe RAG is filter-then-judge.                                     | **Keep.**                                                                                                                                                      |
| Always-on cover blend (`scoreBreakdown.rerankerScore`)                           | Title/entity/temporal cover folded into hybrid score | Ranking signal, not a keep/drop judge                                                                        | **Keep.** Rename local var `coverScore` so it is not confused with the `rerank` flag.                                                                          |
| `rerank: true` (#179 top-20 extra: `score + 0.22 * temporal`)                    | Unsupervised extra on the head                       | Same slot as Jev (reorder / promote). Triple-counts temporal. Never an LLM / cross-encoder.                  | **P0:** skip when Jev actually runs. Stop clobbering cover-blend `rerankerScore`. Still available with `judge: "off"` or when `AI_GATEWAY_API_KEY` is missing. |
| `judge: "jev"` / `rerank: "jev"`                                                 | Opt-in gate (#182)                                   | Duplicate client flags                                                                                       | **P0:** Jev is default-on when the key is present. Flags are accepted no-ops. `judge: "off"` is ablation-only.                                                 |
| `threshold` (hybrid blended score)                                               | Opt-in drop                                          | Different scale from Jev noul `t=0.5`. Applied _before_ the gate, so a high floor can starve the over-fetch. | **P1.** Keep opt-in for `judge: "off"` abstention (labelled 6 all `< 0.8`).                                                                                    |
| `summarize: true`                                                                | Title-join                                           | Not relevance                                                                                                | **Keep.** No LLM.                                                                                                                                              |
| OpenRouter `memory-search`                                                       | Query embedding for vector leg                       | Not a relevance judge                                                                                        | **Keep.**                                                                                                                                                      |
| OpenRouter `fact-extraction` / `enrichment` / context-prompt summarizer          | Write extract, entity enrich, profile prompt         | Not retrieve                                                                                                 | **Keep.** GLiNER is the write-extract follow-on.                                                                                                               |
| `factDecision.ts` ADD/UPDATE/DELETE/NONE                                         | Write supersede                                      | Jev Choice is a later fit                                                                                    | **P1.** Hash-NONE stays first.                                                                                                                                 |
| Context Trace `scoreBreakdown` (BM25 / vector / graph / temporal / jev\*)        | Debug                                                | Jev _adds_ fields; UI still shows hybrid legs only                                                           | **Keep fields.** **P1:** render `jevRelevant` / `jevBest` in `MemoryTraceHover`.                                                                               |

There is no OpenRouter retrieve-judge or cross-encoder path to delete. Competitive brief P0.5 (“OpenRouter rerank on top 20”) shipped as the local extra, then Jev.

In-process eval (`eval/retrieve.ts`) does not call Jev unless `EVAL_JEV=1`. Default labelled IR stays hybrid-only. Live HTTP/MCP/dashboard retrieve is where Jev runs.

## P0 this PR (safe)

1. **Default Jev on.** If `AI_GATEWAY_API_KEY` resolves, over-fetch 20 and rerank. No `judge: "jev"` required on HTTP / SDK / MCP / Convex / dashboard / Chrome. Missing key or a Jev error fail-opens to hybrid (no 422). `judge: "off"` skips Jev for ablation.
2. **Jev supersedes local extra.** `retrieveRanked` passes `rerank: wantsLocalRerank(args, jev)` into `rankMemories`. The extra still runs when Jev is off or the key is missing.
3. **Honest Context Trace.** Local extra mutates `trace.score` only. `rerankerScore` stays the cover blend.
4. **No hybrid gut.** Caps, FTS/vector union, graph hops, temporal rules, OpenRouter embeddings unchanged. Key lookup is parallel with FTS/vector so we do not over-fetch 20 without a key.

## P1 (behind flags / later)

- Deprecate `rerank: true` and drop `rerank: "jev"` / `judge: "jev"` from the wire schema.
- When Jev is on, either ignore hybrid `threshold` or apply it only as a noul floor — do not mix 0–1 blend with noul `t`.
- Jev Choice for `factDecision` (after hash-NONE).
- UI: show jev\* on Context Trace hover.
- Calibrate noul on labelled abstentions + traps (`ai evaluate`). Do not bring back a retrieve hard-drop until labelled R@5 stays at hybrid-only.

## Explicit non-goals

- Replacing hybrid retrieve with Jev (or GLiNER) at query time.
- Making `summarize: true` call an LLM.
- Asking Jev to do date math, counting, or Jaccard.
- Removing OpenRouter embeddings / fact extract.
- 422 when `AI_GATEWAY_API_KEY` is absent.
