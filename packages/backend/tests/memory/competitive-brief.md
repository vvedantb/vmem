# vmem vs SuperMemory vs Mem0 — competitive brief

**Audience:** Vedant / engineering. Convex-only. No Neo4j revival.  
**Date:** 2026-09-17. Public sources checked that day.  
**Goal:** make the Convex memory layer (MCP + HTTP retrieve) competitive on **retrieval quality** and **extreme-case robustness**, not on marketing copy.

This file sits next to the labelled ranker tests. Run the IR eval with `pnpm --filter @vmem/backend eval:bench` (`packages/backend/eval/*`, gated in `tests/memory/eval.test.ts` and `tests/mcp/retrieveQuality.test.ts`).

---

## 1. How to read this

SuperMemory and Mem0 publish **LLM-judge QA scores** (LoCoMo / LongMemEval / ConvoMem / BEAM): ingest a conversation, retrieve, let a model answer, judge the answer. vmem’s labelled bench is **pure IR**: recall@k / MRR / nDCG on known titles, no judge. Those numbers are **not comparable**. Treat competitor benches as “they have a public QA harness + claimed scores,” not as a target we can subtract from.

vmem already has something they mostly do not: an inspectable hybrid ranker with a Context Trace, a labelled corpus with ablations, and a pass/fail bar vs our own Neo4j-era retrieve (2026-07-18).

**Constraint:** every roadmap item stays in Convex tables + Convex search indexes + OpenRouter. No graph database.

---

## 2. vmem current Convex stack (what we actually ship)

Sources: `packages/backend/engine/memory/rank.ts`, `retrieve.ts`, `list.ts`, `extractFacts.ts`, `links.ts`, `convex/memoryRuntime.ts`, `convex/mcp/toolCatalog.ts`, `apps/docs/mcp/tools.mdx`, `apps/docs/api-reference/http-memories.mdx`.

### Surfaces

| Surface                    | Auth                                                                           | Memory ops                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MCP `/mcp` and `/mcp/team` | Clerk OAuth only (`acceptsToken: "oauth_token"`). API keys / session JWTs 401. | `memory_search`, `memory_retrieve`, `memory_add`, `memory_add_instruction`, `memory_update`, `memory_delete`, `memory_related`, MCP App `memory_graph` |
| HTTP `/api/v1/memories`    | Bearer `vmem_sk_…`                                                             | store / retrieve / patch / delete; instruction body on POST/PATCH                                                                                      |
| `@vmem/sdk` (`VMemory`)    | API key                                                                        | `save` / `update` / `search` + structured CRUD. JS only                                                                                                |

Personal MCP also exposes `vmem://context_prompt` (and `context_prompt_get`): about, preferences, pinned memories, profile summary, skills. Skills / wiki / files tools are personal-only.

### Retrieve path (production)

`retrieveRanked` in `convex/memoryRuntime.ts`:

1. List up to **`RETRIEVE_RECENT_CAP = 200`** recent rows (type / tags / status / source filters).
2. Convex FTS `search_text`, **`FTS_TAKE = 32`**.
3. Optional query embedding + Convex `vectorSearch` `by_embedding`, **`VECTOR_CANDIDATE_LIMIT = 32`**.
4. Load **all** `memoryLinks` for the user.
5. Union those docs, then `rankMemories`.

Ranker (`engine/memory/rank.ts`): BM25 + phrase + synonym expand, chunk (sentence overlap, not stored chunks), entity (tag + capitalized tokens), optional vectors, recency (365-day half-life, pinned = 1), 1-hop graph via `memoryLinks`, RRF fusion, then a weighted blend. Each hit gets `trace.scoreBreakdown` + a reason string.

Filters on retrieve: equality on `type` / `status` / `source`, **AND** on tags. No OR/NOT, no numeric/date ops, no metadata DSL, no score `threshold`, no rerank flag, no query rewrite flag. `summarize: true` **joins ranked titles** and does not call an LLM.

### Write path

- Structured create: Convex row; embed if OpenRouter key exists.
- Instruction create (`memory_add_instruction` / HTTP `{ instruction }`): one OpenRouter fact-extract call, then **create new rows**. Missing key → `422 openrouter_required`.
- Instruction **update reuses the same create pipeline** (`{ created, summary }`). It does not patch, supersede, or emit inbox proposals (`apps/docs/api-reference/http-memories.mdx`, `apps/docs/concepts/proposed-updates.mdx`).
- `memoryLinks` exist and the ranker uses them, but **writes are UI/manual** (`relationshipApi` + `LinkMemoryModal`). Extraction does not auto-link. Dream Mode handlers are **no-ops** (`convex/dreamMode.ts` returns empty `"ok"`). Proposed-update list is empty.

### Labelled IR bench (cite this)

Corpus (`packages/backend/eval/corpus.ts`): **488 memories, 36 relationships, 84 queries** (78 answerable, 6 abstention). Types: single-fact, preference, exact-match, project, lexical-trap, update, multi-hop.

Neo4j full-hybrid bar, 2026-07-18, OpenRouter `text-embedding-3-small` (`eval/benchmark.ts` `NEO4J_FULL_HYBRID`):

| Metric    | Neo4j full hybrid |
| --------- | ----------------- |
| recall@1  | 72.4%             |
| recall@5  | 92.0%             |
| recall@10 | 93.3%             |
| MRR       | 0.974             |
| nDCG@10   | 0.857             |

Convex full hybrid, 2026-09-16, **synthetic embeddings** (no OpenRouter in that agent), same ranker as MCP/HTTP retrieve (`tests/mcp/RESULTS.md`):

| Metric    | Convex full hybrid | vs Neo4j bar |
| --------- | ------------------ | ------------ |
| recall@1  | 75.6%              | pass         |
| recall@3  | 97.1%              | pass         |
| recall@5  | **99.4%**          | pass         |
| recall@10 | 100.0%             | pass         |
| MRR       | **0.994**          | pass         |
| nDCG@10   | **0.968**          | pass         |

Ablation on that run: full hybrid nDCG@10 **0.968** vs hybrid-without-graph **0.854** (multi-hop / project). CI (`tests/memory/eval.test.ts`) requires full hybrid ≥ Neo4j on R@5, MRR, nDCG@10; full hybrid nDCG > no-graph / vector-only / bm25-only; lexical-trap and update nDCG@10 > 0.7.

**Caveats (do not hide these):**

- Labelled corpus is ~488 docs and **plants** the 36 links. Production retrieve often has **zero** auto-links, FTS/vector caps of 32, and only 200 recent rows in the lexical pool. Beating the Neo4j bar in-process ≠ beating SuperMemory/Mem0 on 1M–10M-token conversations.
- Synthetic embeddings inflate vector-leg quality vs `text-embedding-3-small`. Re-run with `OPENROUTER_API_KEY` before quoting Convex numbers externally.
- Smaller smoke bench (`tests/memory/benchmark/retrieve.bench.test.ts`) is a tiny synonym/paraphrase set; treat it as a regression canary, not a competitor score.

---

## 3. SuperMemory (public)

Positioning: “context infrastructure” — ingest anything, extract a **fact graph**, keep **document chunks** for RAG (SuperRAG), maintain **profiles**. Custom “learner-1” + “temporal vector-graph engine” they host (or a local binary). They explicitly sell against DIY vector stacks and “thin memory layers.”

### Product

| Area          | What they ship                                                                                                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ingest        | `POST /v3/documents`: text, URL, file, conversation; `customId` for upsert/diff billing; multimodal (PDF, audio, video, images). Async statuses: queued → extracting → chunking → embedding → indexing → done.                                                                                                                                         |
| Dual retrieve | `POST /v4/search` `searchMode`: `memories` \| `documents` \| **`hybrid`** (facts + chunks).                                                                                                                                                                                                                                                            |
| Graph         | Typed edges: **updates / extends / derives**. `isLatest` keeps current truth. `include.relatedMemories` on search. Dreaming: `dynamic` (default, groups related docs) vs `instant` (extra operation).                                                                                                                                                  |
| Profiles      | `POST /v4/profile`: static + dynamic (+ buckets). Can combine with `q` so profile + search is one call.                                                                                                                                                                                                                                                |
| Forget        | Soft-forget + agentic mass-forget (`dryRun`). Forgotten excluded unless `include.forgottenMemories`.                                                                                                                                                                                                                                                   |
| Connectors    | Drive, Notion, Gmail, OneDrive, S3, Granola, GitHub, web crawler (plan-gated).                                                                                                                                                                                                                                                                         |
| MCP           | `https://mcp.supermemory.ai/mcp`, OAuth, no API key. Tools: `search_memory`, `get_profile`, `add_memory` (save **or forget**), `list_documents`, `get_document`, `list_memories`, `list_spaces`, `who_am_i`. MCP Apps: space picker, guided-save, upload, memory-graph. Resources: `supermemory://profile`, `supermemory://spaces`. Prompt: `context`. |
| DX            | TS + Python SDK (`supermemory`). One-line `client.add` / `client.search`. AI SDK / LangChain / Convex **their** plugin, Claude memory tool, SMFS (`smfs.ai`) as a mountable memory filesystem. Self-host binary documented.                                                                                                                            |
| Ops           | Threshold, `rerank` (~+100ms), `rewriteQuery` (multi-rewrite merge, billed as an operation; docs also say “no extra cost” on the search page — treat as **metered operation** per pricing). AND/OR metadata filters. Recency bias composes with rewrite.                                                                                               |

### Retrieval (as documented)

Hybrid vector + keyword, graph traversal in the same search call, optional rerank + query rewrite, similarity threshold (default **0.5** on v4 search). Memories are atomic facts; documents stay as chunks. They claim this is **not** triplet-SPARQL; facts are dense nodes with update/extend/derive edges.

### Claimed benches / scale (vendor numbers)

| Claim                                                                                                                                      | Source                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| LongMemEval-S **85.4%** overall; temporal 82.0%; multi-session 76.7%                                                                       | [Supermemory vs Zep, 2026-04-06](https://supermemory.ai/blog/supermemory-vs-zep) |
| LoCoMo **#1**; P@1 **59.7%**, R@10 **83.5%** (same post; P@1 is IR-like, unlike Mem0’s QA %)                                               | same                                                                             |
| ConvoMem **#1**                                                                                                                            | same + [research](https://supermemory.ai/research)                               |
| SWE-ContextBench (Feb 2026): FAIL_TO_PASS **55.95%**, resolution **30.30%** “best overall”                                                 | [research](https://supermemory.ai/research)                                      |
| Search **187 ms** server / **356 ms** e2e median; 100B–1T+ tokens/month marketing                                                          | [pricing](https://supermemory.ai/pricing/) / research                            |
| Open eval: [MemoryBench](https://github.com/supermemoryai/memorybench) (LoCoMo, LongMemEval, ConvoMem; providers supermemory / mem0 / zep) | [docs](https://supermemory.ai/docs/memorybench/overview)                         |

Do not treat 85.4% vs our 99.4% R@5 as a comparison. Different task. MemoryBench is the **fair** way to compete on their terms.

### Pricing / positioning (2026-09)

[Pricing](https://supermemory.ai/pricing/): Free (~$5 credits/mo, pauses when empty). Pro **$19** ($20 credits). Max **$100** ($130). Scale **$399** ($600). Usage: unique “SM tokens” (repeats free). Rate card (same across plans): memory text ~$5/1M SM tokens (rich $10); SuperRAG 5× cheaper; search ~$5/1M queries; operations (rerank/rewrite/etc.) ~$100/1M ops. Enterprise: SOC2 / HIPAA BAA / self-host. They sell “one engine, not 6 vendors.”

---

## 4. Mem0 (public)

Positioning: **the** memory layer for agents. Two products: Platform (managed, v3 algorithm) and OSS (Apache 2.0, you bring vector DB + LLM). MCP + fat SDKs + 20+ framework integrations. Extraction is first-class (`add(messages)`), search is hybrid.

### Product

| Area      | Platform                                                                                                                                                                                                                                  | OSS                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Add       | `POST /v3/memories/add/` conversation messages, async `event_id`, ADD-only (no overwrite). `infer: false` stores verbatim.                                                                                                                | Same loop, sync library or self-hosted server                            |
| Search    | `POST /v3/memories/search/` hybrid semantic + BM25 + entity; optional temporal + decay + rerank                                                                                                                                           | Hybrid + entity boost; **no** temporal, decay, or native graph           |
| Graph     | Native entity linking, always on, folded into `score`. Dashboard graph view on Pro+                                                                                                                                                       | External Neo4j/etc. **removed** in v3; entity boost only, no `relations` |
| Dream     | Supersede + merge on add (all plans); synthesis weekly/daily on Pro+                                                                                                                                                                      | None                                                                     |
| Filters   | `filters` **required** with `user_id` / `agent_id` / `app_id` / `run_id`. AND/OR/NOT, `in`/`gte`/`lte`/`contains`/`*`. `top_k` 1–1000 (default 10), `threshold` default **0.1**, `rerank` default false, `reference_date`, `show_expired` | Filters exist; operators depend on your vector store                     |
| MCP       | `https://mcp.mem0.ai/mcp` — OAuth **or** API key bearer                                                                                                                                                                                   | n/a (talk to self-hosted API)                                            |
| MCP tools | `add_memory`, `search_memories`, `get_memories`, `get_memory`, `update_memory`, `delete_memory`, `delete_all_memories`, `delete_entities`, `list_entities`, `list_events`, `get_event_status`                                             | —                                                                        |
| Extra     | Webhooks, schema export, batch update/delete (1000), feedback, `get_summary`, custom categories                                                                                                                                           | Bring-your-own embedder/LLM/vector DB                                    |

**No implicit MCP resource.** Agents must call `search_memories`. Implicit-memory docs for vmem already call this out (`apps/docs/mcp/implicit-memory.mdx`). SuperMemory is closer to us here (`supermemory://profile` + `context` prompt).

### Retrieval (as documented)

Parallel signals: vector, BM25 (lemmatized), entity-graph boost, temporal intent classified **without an extra LLM call**, fused by rank. Semantic dominates; temporal is additive so it does not drop candidates. Optional rerank (+150–200ms in older blog copy; docs just say “adds latency”). ADD-only extraction: old and new facts coexist; Dream supersede/merge plus `latest_only` is how they present “current truth.” Temporal metadata is written in a **second async pass** after add; search can race it.

### Claimed benches (managed platform, top_200, single-pass, ±1 judge noise)

From [Memory Evaluation](https://docs.mem0.ai/core-concepts/memory-evaluation) and [README](https://github.com/mem0ai/mem0):

| Benchmark   | Score                                                                                                  | Mean tokens / query |
| ----------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| LoCoMo      | **92.5** (single-hop 91.2, multi-hop 91.3, open-domain 72.7, temporal 92.0)                            | 6,956               |
| LongMemEval | **94.4** (knowledge update 93.6, temporal 97.0, multi-session 88.0)                                    | 6,787               |
| BEAM 1M     | **64.1**                                                                                               | 6,719               |
| BEAM 10M    | **48.6** (temporal 16.3, event ordering 20.2, multi-session 26.1, contradiction 32.5, abstention 40.0) | 6,914               |

OSS “directionally similar, not identical.” Repro: [mem0ai/memory-benchmarks](https://github.com/mem0ai/memory-benchmarks).

**Read BEAM 10M as the honesty table.** Preference/instruction following stay high; **temporal, ordering, multi-session, contradiction, abstention collapse**. That is exactly the extreme-case list we should design against — and they still score those publicly.

### Pricing / positioning (2026-09)

[mem0.ai/pricing](https://mem0.ai/pricing): Hobby **free** (10k add / 1k retrieval / mo). Starter **$19** (50k / 5k). Pro **$249** (500k / 50k, graph view, Dream synthesis). Enterprise custom (on-prem, SLA, SSO). Usage-based option. OSS is free software; you pay LLM + vector DB.

DX win vs vmem: `client.add(messages, user_id=…)` then `client.search(q, filters={user_id})` in four lines, Python **and** JS, LangChain/CrewAI/etc., MCP that accepts an API key for CI.

---

## 5. Capability matrix

Legend: **Y** ships · **P** partial / shell / manual · **N** no.

| Capability                              | vmem Convex                                                              | SuperMemory                               | Mem0 Platform                                    |
| --------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------ |
| Hybrid lexical + vector                 | Y (BM25 + FTS + vectors + RRF)                                           | Y (vector + keyword + graph in one call)  | Y (semantic + BM25 + entity)                     |
| Stored chunk index (doc RAG)            | P (files → memories; no `searchMode`)                                    | Y SuperRAG + `searchMode`                 | N (facts, not a RAG product)                     |
| Cross-encoder / managed rerank          | N                                                                        | Y (`rerank`, ~+100ms)                     | Y (`rerank=true`)                                |
| Query rewrite / multi-query             | P (hardcoded synonym clusters)                                           | Y (`rewriteQuery`)                        | N as a flag (temporal classifies intent)         |
| Similarity threshold                    | N                                                                        | Y (default 0.5)                           | Y (default 0.1)                                  |
| Score breakdown                         | **Y Context Trace** (fulltext/vector/chunk/entity/rrf/recency/graphPath) | P (`similarity` + timing; related opt-in) | Y `score_breakdown` semantic/bm25/entity         |
| Auto entity graph at write              | N (manual `memoryLinks`)                                                 | Y updates/extends/derives                 | Y entity linking                                 |
| 1-hop graph in rank                     | Y **if links exist**                                                     | Y                                         | Y (boost, not a payload)                         |
| Temporal event metadata                 | N (updatedAt recency only)                                               | Y (`isLatest`, forgetAfter, dreaming)     | Y (write-time temporal pass + `reference_date`)  |
| Knowledge update / supersede            | N (instruction update **creates**)                                       | Y UPDATES edge                            | Y Dream supersede + `latest_only`                |
| Dedup / merge                           | N                                                                        | Y                                         | Y Dream merge                                    |
| Forget / soft delete                    | N (hard delete)                                                          | Y                                         | P (`expiration_date`, superseded kept)           |
| Background dream/synthesis              | **N (no-op)**                                                            | Y dynamic/instant dreaming                | Y synthesis on Pro+                              |
| Conversation ingest                     | P (one instruction string)                                               | Y documents + `customId` sessions         | Y `messages[]` async                             |
| Profile injection without search        | Y MCP resource + HTTP `userContext`                                      | Y `/v4/profile` + MCP resource            | N (tool search only; profiles “being finalized”) |
| MCP OAuth                               | Y (Clerk; CF bot-fight on hosted portal)                                 | Y (their hosted IdP)                      | Y                                                |
| MCP API key for headless                | **N**                                                                    | N (OAuth)                                 | **Y**                                            |
| Implicit context resource               | **Y** `vmem://context_prompt`                                            | Y `supermemory://profile`                 | N                                                |
| MCP Apps graph widget                   | Y `memory_graph`                                                         | Y `memory-graph`                          | N                                                |
| Skills / wiki / files as tools          | **Y**                                                                    | P (docs list/get, upload widget)          | N                                                |
| Filter DSL (AND/OR/NOT, dates)          | N (flat type/tags/status)                                                | Y                                         | Y                                                |
| Multi-tenant scope                      | profiles + teams                                                         | `containerTag` + scoped keys              | `user_id`/`agent_id`/`app_id`/`run_id`           |
| Python SDK                              | N                                                                        | Y                                         | Y                                                |
| Framework plugins                       | N                                                                        | Many                                      | Many                                             |
| Public QA harness                       | N (IR only)                                                              | MemoryBench                               | memory-benchmarks + BEAM                         |
| Connectors                              | Drive + Notion                                                           | Broad, plan-gated                         | Not their wedge                                  |
| Chrome extension                        | Y                                                                        | N                                         | N                                                |
| Inspectable self-host of **our** ranker | Y (this repo)                                                            | Local binary (closed engine)              | OSS (weaker than Platform)                       |

---

## 6. Gap list

### 6.1 They do this; we don’t (or it’s a shell)

Ordered by impact on **retrieve quality / robustness**, not on sales.

1. **Candidate generation at scale.** SuperMemory/Mem0 search the index, not “last 200 rows ∪ 32 FTS ∪ 32 vectors.” Past a few hundred memories, vmem will miss gold that is old, lexically weak, or outside the 32-hit FTS/vector window. This is the first extreme-case failure, before ranking math matters.
2. **Write-time structure.** They extract entities / typed edges / temporal spans when memories are added. We extract atomic fact **text** and stop. Graph ranking in the labelled bench is therefore **cheating relative to production** unless someone clicked “link” in the UI.
3. **Current vs stale.** SuperMemory UPDATES + `isLatest`. Mem0 ADD-only + supersede + `latest_only`. Our instruction `update()` **inserts another knowledge row**. Recency (365-day half-life) barely separates “I use Helix” from “I use Zed” a week later. Labelled `update` queries still pass because the corpus **ages** stale rows by many days (`TEMPORAL_COUNT` in `eval/corpus.ts`).
4. **Temporal questions.** Mem0 classifies query time (`last week`, `currently`, `as of March 2025`) and boosts memories whose **event** dates match. SuperMemory keeps version history on facts. We have `createdAt`/`updatedAt` recency only. No `reference_date`.
5. **Rerank + threshold + rewrite.** Both expose these on search. We always return the blended top-k. Abstention/contradiction (Mem0 BEAM 10M weak spots, still **measured**) need a calibrated threshold and/or a second-stage rerank, not just “sort and slice.”
6. **Conversation-native add.** Mem0 `messages[]` + async event. SuperMemory conversation documents + `customId`. We take one instruction string, synchronous. Multi-session benchmarks will ingest poorly.
7. **Dedup / forget / dream.** Mem0 merge+supersede on add; SuperMemory forget + dreaming. Our Dream/proposals/inbox are documented as empty. Duplicate facts accumulate and pollute RRF.
8. **Hybrid memory+document search.** SuperMemory `searchMode: "hybrid"` is how they win “what did the PDF say **and** what did the user decide.” We index PDFs into memories (`files_upload`) but cannot ask for chunks vs facts.
9. **Filter / scope DSL.** Mem0 entity filters are mandatory and expressive. SuperMemory metadata AND/OR. Agents and eval harnesses expect `user_id` + date range + category. We have profileId + three enums + tag AND.
10. **Headless MCP.** Mem0 MCP accepts an API key. Our live MCP e2e could not mint Clerk OAuth from a datacenter (`tests/mcp/RESULTS.md`). That is a DX **and** eval blocker.
11. **Public QA bench adapter.** They publish LoCoMo/LongMemEval numbers. Until we have a MemoryBench or mem0-benchmarks provider, we cannot falsify “we’re worse at multi-hop” vs “our IR corpus is too small.”
12. **Product DX around the engine.** Python SDK, `add(messages)`, plugins, connector breadth, rerank as a boolean. Secondary to ranker quality, but it is why agents pick them in four lines.

### 6.2 Already stronger on Convex (keep these)

Cite the labelled bench in §2 and the code.

1. **Context Trace.** Per-leg scores + graphPath + human reason. Mem0’s breakdown is three floats. SuperMemory returns `similarity`. Debuggability is a product feature; do not collapse it when adding rerank.
2. **IR eval with ablations.** We can turn legs off. We proved graph helps multi-hop/project (nDCG 0.968 vs 0.854) and that full hybrid ≥ the Neo4j 2026-07-18 bar on R@5 / MRR / nDCG@10. Competitors do not publish per-leg IR ablations on a frozen corpus.
3. **Implicit MCP memory.** `vmem://context_prompt` means the model does not have to remember to search. SuperMemory has a profile resource; Mem0 does not. Keep implicit **and** explicit retrieve — implicit is not a substitute for query-specific ranking.
4. **Honest summarize.** Title-join, no fake LLM summary, no 422. SuperMemory/Mem0 summaries are extra model calls (Mem0 Platform `get_summary`; SuperMemory `include.summaries`).
5. **Convex-native hybrid without a second database.** Same argument Mem0 now makes after dropping Neo4j. We already did that. Ranker + FTS + vector index + `memoryLinks` table is the right shape; it is **under-fed**, not wrong.
6. **Agent workspace, not only facts.** Skills, wiki, files, Chrome save, team `/mcp/team`, profiles. Neither competitor is a skills/wiki host. Don’t starve retrieve to copy SuperRAG, but don’t delete this wedge.
7. **Inspectable ranking constants.** BM25 k1=1.4, RRF_k=20, blend weights in `rank.ts`. We can A/B a weight and re-run `eval:bench` in seconds.

### 6.3 Extreme cases (design against BEAM 10M + our own traps)

| Extreme case                                            | Competitor evidence                                                                    | vmem today                                                 | Convex-only fix                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Gold memory older than 200 / outside 32 FTS/vector hits | Mem0 searches with `top_k` up to 1000; SuperMemory indexes all chunks                  | Silent miss                                                | Raise/union index hits; don’t require recency list membership             |
| Multi-hop (“Alice → project → teammate”)                | Mem0 entity graph; SuperMemory derive/extend; our labelled graph **helps when linked** | Fail unless UI link exists                                 | Auto `memoryLinks` or entity table at write                               |
| Knowledge update (Helix → Zed)                          | SuperMemory UPDATES; Mem0 LongMemEval KU 93.6 with ADD-only + supersede                | Two live facts, recency weakly ranked                      | Supersede link + `latest` bias; keep history                              |
| Temporal (“last week”, “currently”)                     | Mem0 temporal 97.0 LME / **16.3** BEAM 10M                                             | Recency only                                               | Event timestamps on write; query-time temporal class                      |
| Lexical trap (same keyword, wrong sense)                | SuperMemory rerank; our labelled trap nDCG>0.7 on tiny corpus                          | Synonym clusters can **hurt** (pnpm/npm/yarn same cluster) | Rerank + narrower synonym lists; don’t expand competitors into one bucket |
| Contradiction                                           | Mem0 BEAM 10M **32.5**                                                                 | No detector                                                | Proposed-update path that actually writes; ranker prefers `isLatest`      |
| Abstention                                              | Mem0 52.5 / 40.0; we have 6 labelled abstentions, **not gated** in CI                  | Always returns something if any lexical leak               | Threshold + “no relevant memories” when top score low                     |
| Near-dup facts                                          | Mem0 merge; SuperMemory dreaming                                                       | Duplicates all rank                                        | Content-hash + merge-on-add                                               |
| Long document vs fact                                   | SuperMemory hybrid searchMode                                                          | File becomes one/few memories                              | Optional chunk table in Convex, retrieve can return chunk hits with trace |
| Headless eval / CI MCP                                  | Mem0 API key MCP                                                                       | OAuth + Cloudflare                                         | Bearer `vmem_sk_` on `/mcp` or a CI OAuth client                          |

---

## 7. Prioritized roadmap (Convex-only)

Do **not** start with Python SDKs or more connectors. Those do not move retrieval quality. Ship in this order. Each item has an acceptance test we can run in this repo.

### P0 — retrieval quality that production actually feels

**P0.1 Candidate pool = indexes, not “recent 200.”**  
Files: `convex/memoryRuntime.ts`, `convex/memoryStore/helpers.ts` (`FTS_TAKE`, `VECTOR_CANDIDATE_LIMIT`, `RETRIEVE_RECENT_CAP`).  
Work: retrieve must union **FTS + vector + (optional) entity/link seeds**, then rank. Recency list is a **leg**, not the universe. Raise FTS/vector take (e.g. 64–128) and add a labelled stress corpus with gold in the tail (memory 500 of 2000).  
Accept: new eval fixture “gold older than cap” fails on main, passes after; p95 ranker time still in-process-cheap (network FTS/vector dominates anyway).

**P0.2 Auto-write `memoryLinks` (or an entity table) on extract/create.**  
Files: `extractFacts.ts`, `memoryRuntime.ts` `storeMemoryFromInstruction`, `memoryStore/helpers.ts` `linkMemories`, new `engine/memory/entities.ts`.  
Work: from fact text, pull proper names / quoted phrases / existing titles; upsert a Convex `memoryEntities` table `(userId, profileId, normalized, embedding?)`; link memories that share an entity; set `reason`. **No Neo4j.** Ranker already consumes `memoryLinks`.  
Accept: labelled multi-hop **without** planting `relationships` in the corpus still beats hybrid-no-graph; production instruction-add of two Alice facts yields a link row.

**P0.3 Instruction update is supersede, not a second create.**  
Files: `memoryRuntime.ts` (update-from-instruction), `engine/memory/extractFacts.ts`, HTTP PATCH docs.  
Work: retrieve related facts → LLM returns ADD vs SUPERSEDE vs NOOP with target ids → patch `status` or a `supersededBy` field, keep the old row, link them (`reason: "updates"`). Inbox proposals can come later; **ranking must see latest**.  
Accept: labelled `update` queries still pass when stale and current are **the same age**; HTTP instruction update no longer only returns `{ created }`.

**P0.4 Temporal fields + query boost.**  
Files: schema `memoryFields`, extract prompt, `rank.ts` new leg `temporal`.  
Work: store `eventStart`/`eventEnd`/`temporalKind` (event/state/plan/preference) at write. Classify query (`last week` / `currently` / explicit date) without a required extra LLM call (rules first; LLM fallback). Additive boost like Mem0 so semantic/lexical still dominate. Support `reference_date` on retrieve for eval.  
Accept: new labelled temporal queries; recency-only ablation loses; full hybrid wins. No graph DB.

**P0.5 Retrieve knobs that competitors already expose, without hiding the trace.**  
API/MCP: `threshold`, `rerank` (OpenRouter cross-encoder or small rerank model on top 20), keep `summarize` as title-join. Optional later: `rewriteQuery` as P1.  
Accept: threshold 0.8 abstains on the 6 labelled abstentions; rerank does not drop Context Trace legs (add `rerank` as an extra breakdown field).

**P0.6 Make the labelled bench honest.**

- Persist `eval:bench` markdown under `packages/backend/eval/` or `internal/bench/` **in git** when numbers change (today it writes a local path that is gitignored/missing).
- CI job or documented nightly with `OPENROUTER_API_KEY` so Convex vs Neo4j bar uses the **same embedder**.
- Add corpus slices for P0.1–P0.4 (tail gold, unplanted multi-hop, same-day update, temporal). Keep synthetic-embedding tests as the fast gate.

### P1 — robustness + comparable numbers

**P1.1 MemoryBench provider.** Implement [supermemoryai/memorybench](https://github.com/supermemoryai/memorybench) `add`/`search` against HTTP `/api/v1/memories`. Run LoCoMo limit=50 first (cost), then LongMemEval. Report accuracy / search latency / context tokens — their MemScore triple. Do **not** chase Mem0’s 94.4 until ingest quality (P0.3/P0.4) exists.

**P1.2 Dream merge + supersede on Convex.** Fill in `dreamMode.ts` instead of returning empty `"ok"`: cluster near-dup hashes, propose merge, materialize `memoryLinks`. Synthesis (higher-order insights) after merge works. Inbox can display what we already typed.

**P1.3 Query rewrite.** Generate 2–3 lexical variants (cheap model), search, RRF-merge. Reuse `expandQueryTerms` but **split** the pnpm/npm/yarn cluster — that cluster is a lexical-trap footgun.

**P1.4 Filter DSL (small).** `AND`/`OR` on tags + `createdAt` range + `status in […]`. Enough to port Mem0-style eval filters. Not a metadata kitchen sink.

**P1.5 MCP bearer API key** (or a non-Clerk machine token) so live retrieve evals don’t depend on Cloudflare Account Portal. HTTP already works this way.

**P1.6 Soft forget.** `status: "forgotten"` excluded from retrieve unless `includeForgotten`. Maps SuperMemory forget / Mem0 expired.

### P2 — product capability after the ranker is fed

- Conversation ingest: `messages[]` + `customId` session upsert (SuperMemory-shaped, stored as Convex documents or a `sourceId` group).
- Optional Convex `memoryChunks` for file RAG; retrieve flag `includeChunks` — **not** SuperRAG as a business line unless we want it.
- JS SDK: `threshold` / `rerank` / `referenceDate`; Python only if a customer asks.
- SuperMemory-style `profile + q` in one HTTP call (we already return `userContext` with retrieve — document it; add static/dynamic split if context_prompt already has the pieces).
- Connectors beyond Drive/Notion: only as ingest into the same extract→link pipeline.
- Do **not** build SMFS. We already have wiki + files MCP.

### Explicit non-goals

- Neo4j, Memgraph, Cosmos graph, or any external graph store.
- Copying SuperMemory’s closed “learner-1” or Mem0 Platform proprietary reranker.
- LLM-judge as the **only** metric. Keep IR ablations; add QA benches as a second number.
- Making `summarize: true` call an LLM (that regresses the honest 422/no-LLM contract).

---

## 8. Suggested 6-step sequence for the next engineering PRs

1. P0.1 candidate pool + tail-gold test (pure retrieve, no LLM).
2. P0.6 OpenRouter labelled run committed so we know the real vector-leg number.
3. P0.2 auto-links/entities so the graph leg exists in prod.
4. P0.3 supersede on instruction update.
5. P0.4 temporal + P0.5 threshold/rerank.
6. P1.1 MemoryBench LoCoMo-50 against staging HTTP.

Stop and re-score after 3 and after 5. If MemoryBench LoCoMo is still far from SuperMemory/Mem0 after 5, the remaining gap is **extraction** (conversation ingest, dreaming), not `rank.ts` weights.

---

## 9. Sources

### SuperMemory

- MCP: https://supermemory.ai/docs/supermemory-mcp/mcp · https://supermemory.ai/mcp/ · https://supermemory.ai/docs/supermemory-mcp/setup
- Search: https://supermemory.ai/docs/memory-api/searching/searching-memories · https://supermemory.ai/docs/recall/search
- Graph / dreaming: https://supermemory.ai/docs/concepts/graph-memory · https://supermemory.ai/docs/concepts/how-it-works · https://supermemory.ai/memory-graph/
- SuperRAG: https://supermemory.ai/docs/concepts/super-rag
- Profiles: https://supermemory.ai/docs/recall/user-profiles
- API map: https://supermemory.ai/docs/api-reference/overview · https://supermemory.ai/docs/llms.txt
- Pricing: https://supermemory.ai/pricing/
- Comparison / benches: https://supermemory.ai/docs/overview/comparison · https://supermemory.ai/blog/supermemory-vs-zep · https://supermemory.ai/research
- MemoryBench: https://supermemory.ai/docs/memorybench/overview · https://github.com/supermemoryai/memorybench · https://supermemory.ai/docs/memorybench/memscore

### Mem0

- MCP: https://docs.mem0.ai/platform/mem0-mcp
- Search v3: https://docs.mem0.ai/api-reference/memory/search-memories
- Graph: https://docs.mem0.ai/platform/features/graph-memory
- Temporal: https://docs.mem0.ai/platform/features/temporal-reasoning
- Eval / benches: https://docs.mem0.ai/core-concepts/memory-evaluation · https://github.com/mem0ai/memory-benchmarks
- Dream: https://docs.mem0.ai/platform/features/dream · https://mem0.ai/blog/dream-background-memory-consolidation-for-ai-agents
- Add: https://docs.mem0.ai/api-reference/memory/add-memories
- Platform vs OSS: https://docs.mem0.ai/platform/platform-vs-oss
- Embeddings blog: https://mem0.ai/blog/how-mem0-uses-embeddings-and-why-we-are-evaluating-nvidia-nemotron-3-embed
- Pricing: https://mem0.ai/pricing
- Index: https://docs.mem0.ai/llms.txt · https://github.com/mem0ai/mem0

### vmem (this repo)

- Ranker: `packages/backend/engine/memory/rank.ts`
- Runtime retrieve caps: `packages/backend/convex/memoryRuntime.ts` (`RETRIEVE_RECENT_CAP`, `VECTOR_CANDIDATE_LIMIT`)
- FTS cap: `packages/backend/convex/memoryStore/helpers.ts` (`FTS_TAKE`)
- Labelled eval: `packages/backend/eval/benchmark.ts`, `eval/corpus.ts`, `tests/memory/eval.test.ts`
- Live numbers vs Neo4j bar: `packages/backend/tests/mcp/RESULTS.md` (2026-09-16)
- MCP catalog: `packages/backend/tests/mcp/catalog.ts`, `apps/docs/mcp/tools.mdx`
- Dream no-op: `packages/backend/convex/dreamMode.ts`
- Proposed updates empty: `apps/docs/concepts/proposed-updates.mdx`
