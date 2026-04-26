# Enrichment & Deduplication — vmem vs Competitors

Date: 2026-04-26

Source: Direct analysis of competitor source code at `~/Downloads/memory-codebases/` (Supermemory, Mem0, Honcho, Hermes, IWE, GitNexus, code-review-graph).

---

## Executive Summary

vmem's enrichment pipeline is architecturally stronger than both Supermemory and Mem0 — real graph DB (Neo4j), multi-hop retrieval, Context Trace, ProposedUpdates. The main gap was **content-level deduplication**, which has now been implemented as a 4-layer dedup pipeline. A unique challenge arose from vmem's Chrome extension importing browsing history (a feature no competitor has), where sites with generic `<title>` tags created dozens of "duplicate" memories.

---

## 1. Deduplication Comparison (from source code)

### Supermemory — Minimal

- **No deduplication at ingestion time.** None.
- Dedup happens **only at retrieval**: exact string matching via `Set<string>` in `tools-shared.ts:121-176` (priority: Static > Dynamic > Search Results)
- Browser extension silently swallows `409 Conflict` from the API
- No hash, no semantic similarity, no title matching on add
- The Updates/Extends/Derives relationships exist as TypeScript types and mock data — the actual creation logic lives in their closed-source backend

### Mem0 — MD5 Hash Only

- **MD5 hash dedup** (`main.py:799`): `hashlib.md5(text.encode()).hexdigest()`
- Checked against `existing_hashes` (from DB) and `seen_hashes` (current batch)
- Prevents exact-duplicate text within a single `add()` call AND across history
- **No semantic dedup at ingestion** — only exact byte-level match
- Entity store uses 0.95 cosine threshold, but only for entity linking (not memory dedup)
- Append-only during add: no UPDATE/DELETE during creation

### vmem — 4-Layer Pipeline (implemented 2026-04-26)

| Layer            | Check                                                         | Cost                      | Catches                                    |
| ---------------- | ------------------------------------------------------------- | ------------------------- | ------------------------------------------ |
| 1a. URL          | Exact normalized URL match                                    | O(1) index                | Same page revisited                        |
| 1b. Title+Domain | Same title from same origin (browsing-history/bookmarks only) | O(1) index                | Generic `<title>` across same-site pages   |
| 2. Content Hash  | MD5 of `normalize(title + content)`                           | O(1) index, zero API cost | Identical content (Mem0-style)             |
| 3. Semantic      | Vector cosine similarity ≥ 0.95                               | One vector query          | Near-duplicates differing by trivial edits |

All layers return existing memory with incremented `visitCount` on match. Memory creation is never blocked — it either creates or merges.

**vmem is the only system with semantic dedup at ingestion time.** Neither Supermemory nor Mem0 do this.

---

## 2. Enrichment Pipeline Comparison

### Supermemory

- 6-stage async queue: `Queued → Extracting → Chunking → Embedding → Indexing → Done`
- Semantic chunking with AST-aware code splitting
- Multi-format extraction: PDF, OCR, video transcription
- `entityContext` parameter guides extraction (max 1500 chars)
- Multiple embedding models tracked (standard + matryoshka)
- **No explicit entity extraction or tag generation in client code** — appears backend-only

### Mem0

- 8-phase synchronous batch pipeline
- Single LLM extraction call with `ADDITIVE_EXTRACTION_PROMPT` (detailed framework for fact extraction from conversations)
- **spaCy NLP for entity extraction** — 4 types: PROPER, QUOTED, COMPOUND, NOUN — deterministic, no API cost
- Entity store with `linked_memory_ids` for graph traversal
- `observation_date` for temporal grounding (resolves relative → absolute dates)
- `attributed_to` for speaker tracking
- Lemmatized text stored for BM25 keyword search

### vmem

- Async via `ctx.scheduler.runAfter(0)` — non-blocking
- Single LLM call (Qwen3-235B via OpenRouter) extracts: tags (3-5), related memory IDs, entities (person/org/place/tech)
- Embedding via `text-embedding-3-small` (1536d)
- Entities stored as Neo4j nodes with `MENTIONS` edges (hub pattern)
- Precomputed `RELATES_TO` edges (semantic similarity + content similarity + same-session + same-domain)
- Tags stored as separate nodes with `TAGGED_WITH` edges

### Key Differences

| Feature                      | Supermemory              | Mem0                      | vmem                |
| ---------------------------- | ------------------------ | ------------------------- | ------------------- |
| Entity extraction            | Unknown (backend)        | spaCy NLP (deterministic) | LLM (semantic)      |
| Tag generation               | No                       | No                        | Yes (unique)        |
| Graph DB                     | No (relational + vector) | No (vector store)         | Yes (Neo4j)         |
| Multi-hop traversal          | No                       | No (entity linking only)  | Yes (1-hop + 2-hop) |
| Temporal grounding           | No                       | Yes (observation_date)    | No                  |
| Speaker attribution          | No                       | Yes (attributed_to)       | No                  |
| Precomputed similarity edges | No                       | No                        | Yes                 |
| Context Trace                | No                       | No                        | Yes (unique)        |
| ProposedUpdates              | No                       | No                        | Yes (unique)        |

---

## 3. Retrieval Comparison

### Supermemory

- Cosine similarity + optional hybrid (keyword)
- Relationship expansion follows Updates/Extends/Derives edges from initial results
- `chunkThreshold` (0-1) for sensitivity tuning
- Metadata filters with AND/OR logic (up to 5 nesting levels)
- No reranking

### Mem0

- 3-signal hybrid: semantic + BM25 + entity boost
- BM25 normalization via query-length-adaptive sigmoid (`scoring.py`)
- Entity boost: spread-attenuated formula `similarity * 0.5 * (1 / (1 + 0.001 * ((num_linked - 1)^2)))`
- Combined score: `(semantic + bm25 + entity_boost) / max_possible`
- Optional pluggable rerankers (Cohere, LM-based)
- Semantic threshold gate before combining

### vmem

- 3-leg: Fulltext (BM25) + Vector + Graph expansion
- Graph expansion: 1-hop RELATES_TO, 1-hop entity hub (MENTIONS), 2-hop chained
- RRF scoring: `0.4*fulltext + 0.35*vector + 0.15*recency + 0.1*confidence + graphBoost`
- Graph boost: 1.0 for 1-hop, 0.5 for 2-hop
- Context Trace: score breakdown explains WHY each memory matched

---

## 4. The Browsing History Problem (vmem-specific)

Neither Supermemory nor Mem0 import browser history. This is a unique vmem feature via the Chrome extension, which creates a unique dedup challenge:

**Problem**: The extension sends `document.title` as the memory title. Sites with a generic `<title>` (e.g. "vmem" on every route) produce N separate memories that appear identical in the UI but have different URLs/content.

**Example**: 73 memories titled "vmem" from different routes on `vmem-git-staging-vedantb.vercel.app/*`, each with unique URL but same page title.

**Solution**: Layer 1b (title+domain dedup) — for browsing-history/bookmarks sources, if a memory exists with the same title from the same origin, increment visit count instead of creating a new node. Cleanup migration merges existing duplicates.

---

## 5. Other Competitor Codebases

### Honcho (plastic-labs)

Agent memory with async **Deriver** — most sophisticated enrichment of all competitors:

- Background reasoning that builds user representations, session summaries, "peer cards"
- "Dream processing": asynchronous synthesis of peer profiles
- Surprisal scoring to detect anomalies and important patterns
- Not a traditional memory store — it synthesizes representations, so dedup is implicit

### Hermes (Nous Research)

Agent OS that treats memory as **pluggable** — integrates Mem0, Supermemory, Honcho, and others as backend plugins. Interesting architecture pattern but no novel dedup logic.

### IWE

Rust knowledge graph with **polyhierarchy** — same note under multiple parents without duplication. Dedup via structural linking, not content matching. Different paradigm entirely.

---

## 6. vmem's Remaining Gaps

| Gap                                        | Who has it                              | Priority                                        |
| ------------------------------------------ | --------------------------------------- | ----------------------------------------------- |
| Temporal grounding (observation_date)      | Mem0                                    | Medium — resolves "yesterday" → absolute date   |
| Speaker attribution                        | Mem0                                    | Low — vmem is personal-first, not multi-speaker |
| Memory versioning (isLatest chain)         | Supermemory types, Mem0 history table   | Medium — ProposedUpdates partially covers this  |
| Derived insights (infer novel connections) | Supermemory types (unconfirmed in code) | High — Dream Mode V2 roadmap item               |
| Pluggable rerankers                        | Mem0                                    | Low                                             |
| BM25 sigmoid normalization                 | Mem0                                    | Low — current RRF scoring works well            |
| Background reasoning (Deriver pattern)     | Honcho                                  | High — aligns with Dream Mode V2                |
