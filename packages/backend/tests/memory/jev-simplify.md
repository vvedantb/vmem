# Jev retrieve simplify

After [#182](https://github.com/vvedantb/vmem/pull/182) (`judge: "jev"` / `rerank: "jev"` on clear-bear-690), this note maps what in vmem overlaps Jev and what we actually removed.

**Lock:** hybrid retrieve still generates candidates (`rank.ts` FTS + vector + graph + temporal). Jev is the second-stage keep / score / best judge. GLiNER stays deferred.

Sibling: [jev-retrieve-gate.md](./jev-retrieve-gate.md). Research: [extraction-research-gliner-jev.md](./extraction-research-gliner-jev.md) (#181).

## Overlap map

| Path | Job today | vs Jev | This PR |
| --- | --- | --- | --- |
| Hybrid candidate gen (`rank.ts` BM25 / phrase / RRF / vector / graph / temporal) | Pool + rank | Complement. Jev is weak at date math; TypeSafe RAG is filter-then-judge. | **Keep.** |
| Always-on cover blend (`scoreBreakdown.rerankerScore`) | Title/entity/temporal cover folded into hybrid score | Ranking signal, not a keep/drop judge | **Keep.** Rename local var `coverScore` so it is not confused with the `rerank` flag. |
| `rerank: true` (#179 top-20 extra: `score + 0.22 * temporal`) | Unsupervised extra on the head | Same slot as Jev (reorder / promote). Triple-counts temporal. Eval `RESULTS.md` credits temporal + index pool, not this flag. Never an LLM / cross-encoder. | **P0:** skip when Jev is on. Stop clobbering cover-blend `rerankerScore`. Leave the flag for no-Jev callers. |
| `judge: "jev"` and `rerank: "jev"` | Same gate | Duplicate flags | **P0:** `judge` is canonical; `rerank: "jev"` stays an alias. `wantsLocalRerank` is `rerank === true && !wantsJevJudge`. |
| `threshold` (hybrid blended score) | Opt-in drop | Different scale from Jev noul `t=0.5`. Applied *before* the gate, so a high floor can starve the over-fetch. | **P1.** Keep opt-in for no-Jev abstention (labelled 6 all `< 0.8`). |
| `summarize: true` | Title-join | Not relevance | **Keep.** No LLM. |
| OpenRouter `memory-search` | Query embedding for vector leg | Not a relevance judge | **Keep.** |
| OpenRouter `fact-extraction` / `enrichment` / context-prompt summarizer | Write extract, entity enrich, profile prompt | Not retrieve | **Keep.** GLiNER is the write-extract follow-on. |
| `factDecision.ts` ADD/UPDATE/DELETE/NONE | Write supersede | Jev Choice is a later fit | **P1.** Hash-NONE stays first. |
| Context Trace `scoreBreakdown` (BM25 / vector / graph / temporal / jev\*) | Debug | Jev *adds* fields; UI still shows hybrid legs only | **Keep fields.** **P1:** render `jevRelevant` / `jevBest` in `MemoryTraceHover`. |

There is no OpenRouter retrieve-judge or cross-encoder path to delete. Competitive brief P0.5 (“OpenRouter rerank on top 20”) shipped as the local extra, then Jev.

## P0 this PR (safe)

1. **Jev supersedes local extra.** `retrieveRanked` passes `rerank: wantsLocalRerank(args)` into `rankMemories`. `judge: "jev"` + `rerank: true` no longer double-processes the head.
2. **Canonical flag.** Docs + MCP: use `judge: "jev"`. `rerank: "jev"` still works. Do not drop the alias (just shipped in #182).
3. **Honest Context Trace.** Local extra mutates `trace.score` only. `rerankerScore` stays the cover blend so Jev traces keep BM25/vector/graph/temporal plus jev\* without a rewritten extra.
4. **No hybrid gut.** Caps, FTS/vector union, graph hops, temporal rules, OpenRouter embeddings unchanged.

## P1 (behind flags / later)

- Deprecate or default-off `rerank: true` once Jev is the usual second stage (keep for eval / no-key).
- When Jev is on, either ignore hybrid `threshold` or apply it only as a noul floor — do not mix 0–1 blend with noul `t`.
- Auto-`judge: "jev"` when `TYPESAFE_API_KEY` is set (today still opt-in; missing key fail-opens).
- Jev Choice for `factDecision` (after hash-NONE).
- UI: show jev\* on Context Trace hover.
- Drop `rerank: "jev"` from the wire schema after callers move to `judge`.
- Calibrate noul `t` on labelled abstentions + traps (`ai evaluate`); freeze before changing `0.5`.

## Explicit non-goals

- Replacing hybrid retrieve with Jev (or GLiNER) at query time.
- Making `summarize: true` call an LLM.
- Asking Jev to do date math, counting, or Jaccard.
- Removing OpenRouter embeddings / fact extract.
- Changing default retrieve when the Jev flag or key is absent.
