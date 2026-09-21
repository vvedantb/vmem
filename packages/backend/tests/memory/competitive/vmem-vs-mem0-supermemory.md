# Labelled IR head-to-head: vmem vs Mem0 vs SuperMemory

Fair retrieval comparison on **the same labelled corpus and queries**. Pure IR (recall@k / MRR / nDCG), no LLM judge. This is not a LoCoMo / LongMemEval / MemoryBench QA score, and vendor blog numbers are not copied into the table.

Harness: `packages/backend/tests/memory/competitive/`. Re-run:

```bash
EVAL_COMPETITIVE=1 pnpm --filter @vmem/backend eval:competitive
```

`EVAL_COMPETITIVE=1` **fails closed** if `MEM0_API_KEY` or `SUPERMEMORY_API_KEY` is missing. It does not invent vendor recall/MRR/nDCG. CI `pnpm test` stays unit-only (matching, subsetting, fail-closed).

---

## Method

### Corpus / queries

Same generator as `packages/backend/eval/*` (`generateBenchmarkCorpus()`):

|                       | Count   |
| --------------------- | ------- |
| Memories              | **493** |
| Answerable queries    | **81**  |
| Abstention queries    | **6**   |
| Planted relationships | 36      |

Query types: single-fact, preference, exact-match, project, lexical-trap, update, multi-hop, temporal.

If a vendor free tier forces a smaller run, set `COMPETITIVE_QUERY_LIMIT` (and optionally `COMPETITIVE_MEMORY_LIMIT`). **Every system still gets the identical query list.** Gold + trap titles for those queries are always ingested; extra rows fill up to the memory cap. Record the env values in the live report.

### Metrics

Same helpers as `eval:bench` (`packages/backend/eval/metrics.ts`):

| Metric            | Definition                                   |
| ----------------- | -------------------------------------------- |
| recall@1/3/5/10   | Fraction of gold **titles** in the top k     |
| MRR               | Mean reciprocal rank of the first gold title |
| nDCG@10           | Graded nDCG using the corpus `relevance` map |
| latency p50 / p95 | Search-only, milliseconds (ingest excluded)  |

k = 10 (`EVAL_K`). Abstention queries are recorded but do not enter recall/MRR/nDCG means.

Vendor hits are mapped back to labelled titles in this order: `metadata.vmem_title` → `metadata.vmem_id` / `customId` → longest labelled title contained in the returned text. Unmapped hits do not count. Duplicate titles keep first rank.

### Systems

| System                      | What this harness calls                                                                                      | Write                                                                                                                                       | Search knobs (default here)                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **vmem hybrid-only**        | In-process Convex ranker (`judge: "off"`), same as `eval:bench` full hybrid                                  | Local corpus rows (no HTTP)                                                                                                                 | Hybrid FTS + vector + graph + temporal. Synthetic embeddings unless `AI_GATEWAY_API_KEY` (`openai/text-embedding-3-small`)                       |
| **vmem default Jev-rerank** | Same hybrid, then TypeSafe System One `jev-latest` on the top 20 (**rerank only**, no noul hard-drop — #187) | Same                                                                                                                                        | Requires `TYPESAFE_API_KEY`. Missing key → row stays `—` (does **not** copy hybrid numbers)                                                      |
| **Mem0 Platform**           | `POST https://api.mem0.ai/v3/memories/add/` then `POST /v3/memories/search/`                                 | `infer: false` (verbatim title+content), `user_id=vmem_labelled_ir`, metadata `vmem_id` / `vmem_title`, `timestamp` from corpus `createdAt` | `top_k=10`, `rerank=false`, `threshold=0` (IR-fair). Product default threshold is 0.1 — use `COMPETITIVE_VENDOR_DEFAULTS=1` to omit the override |
| **SuperMemory**             | `POST https://api.supermemory.ai/v3/documents/batch` then `POST /v4/search`                                  | One document per labelled memory, `customId=memory.id`, `containerTag=vmem_labelled_ir`, `documentDate=createdAt`, `dreaming=instant`       | `searchMode=hybrid`, `limit=10`, `rerank=false`, `threshold=0` (IR-fair). Product default threshold is **0.5**                                   |

`COMPETITIVE_SKIP_INGEST=1` reuses a previous write (same `user_id` / `containerTag`). Mem0 re-ingest deletes that `user_id` first so rows are not duplicated.

### Embedding / ranker notes

- **vmem** numbers in git from #184/#186 used **deterministic synthetic embeddings** (no live embedder). Vector quality is not `text-embedding-3-small`. Re-run with `AI_GATEWAY_API_KEY` before quoting vmem externally.
- **Mem0 / SuperMemory** choose their own hosted embedders. This harness cannot pin them to the same model.
- **Jev** judges title/content of the hybrid head; it is not an embedder. Post-#187 it **reorders** the head and does not drop low-noul hits.

---

## Side-by-side

Empty cells (`—`) mean **not measured in this repo yet**. Do not paste LoCoMo / LongMemEval / MemoryBench / pricing-page latency into this table.

| System                                       | recall@1 | recall@3 | recall@5   | recall@10 | MRR       | nDCG@10   | p50 ms | p95 ms | notes                                                                                                                         |
| -------------------------------------------- | -------- | -------- | ---------- | --------- | --------- | --------- | ------ | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| vmem hybrid-only                             | 75.3%    | 96.3%    | **100.0%** | 100.0%    | **0.988** | **0.975** | 61     | 66     | Labelled harness, synthetic embeddings, `judge: "off"`. Committed in #184/#186 (`tests/memory/benchmark/jev-gate-results.md`) |
| vmem default Jev-rerank (no hard-drop, #187) | —        | —        | —          | —         | —         | —         | —      | —      | **TODO: `TYPESAFE_API_KEY`**. Pre-#187 hard-drop R@5 **84.6%** is superseded and is **not** the product default               |
| Mem0 Platform                                | —        | —        | —          | —         | —         | —         | —      | —      | **TODO: `MEM0_API_KEY`**                                                                                                      |
| SuperMemory                                  | —        | —        | —          | —         | —         | —         | —      | —      | **TODO: `SUPERMEMORY_API_KEY`**                                                                                               |

A separate Convex ablation table (`eval/labelled-bench.md`, same corpus, synthetic) reports full hybrid R@5 **99.7%** / nDCG@10 **0.974** — same ballpark as the #186 hybrid-only control; quote the #186 row above when comparing to vendors.

Paste stdout from `eval:competitive` here after a live run (or leave `—`).

---

## Keys / signup

Neither Mem0 nor SuperMemory exposes a non-interactive signup API. Cloud VMs without keys must leave vendor rows empty.

### Mem0 (`MEM0_API_KEY`)

1. Open [https://app.mem0.ai](https://app.mem0.ai) and create an account (GitHub / Google / email).
2. Dashboard → **Settings → API keys** → create a key.
3. Hobby is free (docs: 10k adds / 1k retrievals / month — 493 writes + 87 searches fit).
4. `export MEM0_API_KEY="…"` (never commit it). Auth header is `Authorization: Token $MEM0_API_KEY`.

### SuperMemory (`SUPERMEMORY_API_KEY`)

1. Open [https://console.supermemory.ai](https://console.supermemory.ai) and create an account.
2. Create an org API key.
3. Free plan includes a small monthly credit; **493 `dreaming: instant` documents can exhaust it** (402). If that happens, set a shared `COMPETITIVE_QUERY_LIMIT` / `COMPETITIVE_MEMORY_LIMIT` and re-run all three systems on that subset.
4. `export SUPERMEMORY_API_KEY="…"` Auth header is `Authorization: Bearer $SUPERMEMORY_API_KEY`.

### Optional vmem Jev column (`TYPESAFE_API_KEY`)

Same key as product retrieve. [TypeSafe](https://platform.typesafe.ai) — interactive. Aliases: `TYPESAFE_AI_API_KEY`, `JEV_API_KEY`. Without it the Jev row stays `—`.

---

## Caveats

- **Self-reported vendor benches ≠ this harness.** Mem0 LoCoMo 92.5 / LongMemEval 94.4 and SuperMemory LongMemEval-S 85.4 / LoCoMo P@1 59.7 are LLM-judge QA (or different IR corpora). They cannot be subtracted from labelled R@5. For a no-LLM LoCoMo _retrieval_ port (gold `dia_id` spans), see [`memorybench-ir-port.md`](./memorybench-ir-port.md) (`eval:locomo-ir`).
- **Write semantics differ.** vmem hybrid-only ranks the exact labelled rows (titles are native). Mem0 is stored with `infer: false` so IR units survive; that is **not** Mem0’s default extraction `add(messages)`. SuperMemory document ingest still extracts memories asynchronously; hybrid search may return rewritten facts. Title matching can under-count if the vendor drops the title string.
- **vmem production retrieve** is hybrid + Jev rerank when `TYPESAFE_API_KEY` is set (#183/#187). CI `eval:bench` is hybrid-only. Do not treat pre-#187 hard-drop Jev (R@5 84.6%, 16 gold titles removed) as current default.
- **Candidate generation.** vmem labelled numbers use the in-process index pool. Mem0/SuperMemory search their hosted indexes. Caps, thresholds, and recency lists are not identical.
- **Latency** is client-observed HTTP (or in-process ranker) p50/p95, not vendor “server median” marketing.
- **Graph / temporal.** Labelled vmem includes planted `memoryLinks` and event timestamps. SuperMemory/Mem0 may extract their own edges/times; this harness does not plant vendor graphs.
- **Rate limits / 429.** The client retries 429/5xx. If you must subset, keep queries identical across systems.

Capability / roadmap notes (not scores): `tests/memory/competitive-brief.md`.
