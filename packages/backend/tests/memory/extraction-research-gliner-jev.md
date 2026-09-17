# GLiNER2.5 + TypeSafe Jev — extraction / retrieve-gate research

**Audience:** Vedant / engineering. Convex-only store. No Neo4j revival.  
**Date:** 2026-09-17. Public sources checked that day.  
**Sibling:** `competitive-brief.md` (SuperMemory / Mem0). This note is the **extraction** follow-on after P0 retrieve work landed.

**Shipped on `main` before this note:**

| PR | What landed |
| --- | --- |
| [#176](https://github.com/vvedantb/vmem/pull/176) | Retrieve candidate pool = FTS + vector indexes (not last-200-only) |
| [#177](https://github.com/vvedantb/vmem/pull/177) | Auto-extract entities + write `memoryLinks` on Convex store |
| [#178](https://github.com/vvedantb/vmem/pull/178) | Supersede prior rows on instruction update |
| [#179](https://github.com/vvedantb/vmem/pull/179) | `eventStart` / `eventEnd` / `temporalKind`, query temporal class, additive temporal leg, `threshold`, optional top-20 `rerank` |

IR numbers after #179 (synthetic embeddings): labelled R@5 **99.7–100%**, nDCG@10 **0.974–0.975**, temporal nDCG **0.780 → 1.000**, all 6 abstentions score **< 0.8**. Tables: `packages/backend/eval/RESULTS.md`.

**Access (do not put keys in this file, git, or the PR):** P0/P1 Jev experiments can use env `TYPESAFE_API_KEY` **immediately** (no waitlist). That variable is stored on the engineer box for local spikes. Do not request, print, or embed the key. Cloud-agent spikes must have the same name added to the **saved Cursor environment / secret store** separately — never by committing it. Details: §4.2.

GLiNER is a **separate** path. It still needs a hosting decision. Jev access does not unblock GLiNER, and GLiNER hosting does not block Jev experiments.

---

## 1. Why this note exists

The competitive brief’s remaining quality gap after ranking is **write-time structure** and **calibrated retrieve decisions**.

- SuperMemory / Mem0 extract typed entities, edges, and temporal spans when memories are added. vmem now does a **regex fallback + optional OpenRouter JSON enrich** (#177) and **rule + LLM temporal fields** (#179). That is real, but it is still “names + clique links,” not a schema-decoded graph.
- Retrieve now has a **heuristic** `threshold` / `rerank` (#179). Competitors expose a second-stage judge. Jev is a decision model built for that slot: state in, typed probabilities out, no string generation.

Two tools, two jobs:

| Tool | Job in vmem | Can emit fact text? |
| --- | --- | --- |
| **GLiNER2.5** | On-write spans, typed entities, relations, attributes, records | No (spans / labels / graphs) |
| **Jev** | Retrieve gate, relevance, confidence thresholds, later ADD/UPDATE/DELETE/NONE | No (Choice / Score / Boolean only) |

Atomic first-person facts (`extractFacts.ts` → OpenRouter `qwen/qwen3-235b-a22b-2507`) stay on a generative model.

---

## 2. What vmem extract / retrieve actually does today

Sources: `engine/memory/extractFacts.ts`, `entities.ts`, `temporal.ts`, `factDecision.ts`, `supersede.ts`, `rank.ts`, `retrieveCaps.ts`, `convex/memoryRuntime.ts`, `convex/memoryExtract.ts`, `convex/memoryStore/helpers.ts`, `convex/memoryStore/entities.ts`.

### 2.1 Write path (instruction)

1. **Fact split.** `buildFactExtractionPrompt` asks OpenRouter for atomic, durable, first-person facts. JSON parse via Zod. Missing `OPENROUTER_API_KEY` → HTTP `422 openrouter_required`. Empty extract falls back to the raw instruction as one fact.
2. **Temporal on the fact.** Prompt also asks for `temporalKind` (`event` / `state` / `plan` / `preference`) and `eventStart` / `eventEnd`. Store copies those onto the new row; `inferTemporalFields` fills gaps from title/content (`yesterday`, ISO dates, `currently`, `prefer`, …).
3. **Supersede (#178).** Exact content-hash → `NONE`. Jaccard ≥ 0.6 → `UPDATE` (new row, prior `suppressed`, `reason: "updates"`). Instruction **update** can additionally call the LLM ADD/UPDATE/DELETE/NONE judge (`factDecision.ts`) then the same deterministic override.
4. **Row insert.** Convex `memories` with `eventStart` / `eventEnd` / `temporalKind`. Facts extracted together get an `origin: extract` clique link (`"extracted together"`).
5. **Entity fallback (sync, never 422).** `extractEntitiesFallback`: quoted phrases, `the X team/board/…`, `X project` / `X project overview`, capitalized tokens, non-generic tags, known-entity mentions. Types: `person` / `organization` / `place` / `technology` / `project`. Cap 10. Upserts `memoryEntities` + `memoryEntityMentions`. Auto-writes `memoryLinks` (`origin: entity` / `extract`), including project-detail → latest `X project overview`. Manual `origin: manual` wins on the same pair.
6. **LLM entity enrich (async).** `scheduleMemoryEntityExtraction` → `extractMemoryEntitiesInternal`. Same OpenRouter JSON chat (`feature: "enrichment"`). Merges with fallback. Missing key or parse failure keeps the fallback.

### 2.2 Retrieve path (post #176 / #179)

1. Union FTS (`FTS_TAKE = 256`) + vector (`VECTOR_CANDIDATE_LIMIT = 256`) + graph neighbors of seeds. Recency list is a **leg**, not the universe. Rank pool cap 384.
2. Ranker: BM25 + phrase + synonyms, chunk, entity tokens, optional vectors, recency, 1–2 hop `memoryLinks`, RRF, blend. Additive **`+ 0.22 * temporal`**. Query temporal class is **rules**, not an LLM (`last week`, `currently`, ISO dates; `referenceDate` for eval).
3. Optional `rerank` re-sorts top 20 with a **local** extra (not a cross-encoder). Optional `threshold` drops hits. Context Trace keeps every leg (`temporal`, `rerankerScore`).
4. `summarize: true` still title-joins. No LLM.

### 2.3 What is still weak

- Fallback NER is regex. Two-token Title Case → `person`, else `technology`. Misses lowercase project names, over-fires on sentence starts, does not emit **typed relations** (`works_for`, `located_in`) — only “share an entity name ⇒ undirected link.”
- LLM extract is prompt + JSON parse. It can omit entities, invent related IDs (we filter to recent 16), or fail closed to fallback. No span offsets, no confidence, no schema constraints.
- Fact extract cannot be replaced by GLiNER or Jev: both refuse free-form generation.
- Retrieve `threshold` / `rerank` are **unsupervised heuristics**. Labelled abstentions all sit under 0.8, but lexical traps still leak (nDCG@10 **0.969**). No calibrated P(relevant).
- Jev 1.13 is bad at date arithmetic. Keep `temporal.ts` in code; do not ask Jev “is this last week?”

---

## 3. GLiNER2.5 (on-write structure)

**Primary:** [Introducing GLiNER2.5](https://fastino.ai/blog/gliner2-5-span-free-information-extraction) (Mary Newhauser & Urchade Zaratiana, 2026-08-24).  
**Product:** [fastino.ai/models/gliner2-5](https://fastino.ai/models/gliner2-5).  
**Weights:** Apache 2.0 on Hugging Face — `fastino/gliner2.5-small-v1` (74M, DeBERTa-v3-xsmall), `gliner2.5-base-v1` (194M, DeBERTa-v3-base, English), `gliner2.5-multi-v1` (287M, mDeBERTa-v3-base).  
**Code:** [fastino-ai/GLiNER2](https://github.com/fastino-ai/GLiNER2). Load **`AutoExtractor.from_pretrained(...)`**. `GLiNER2.from_pretrained` is the **legacy span** loader and will not dispatch 2.5 boundary checkpoints.

### 3.1 What changed vs GLiNER2

Earlier GLiNER enumerated a start×width span grid (width cap ~8–12 words). GLiNER2.5 scores **start / end / inside** per schema query, sparsely pairs boundaries, then reranks proposed spans. Effects Fastino actually ships:

- **No max span width** inside one encoded window (`max_len=4096` words on 2.5).
- **Linear** compute in document length for a fixed schema + candidate budget.
- **Native long-doc chunking** (`extract_entities_long`, overlap merge, original character offsets). A span/relation is kept only if both ends land in the **same chunk**.
- **Joint IE:** `JointIE` beam-decodes a graph that obeys declared entity types, typed relations, `unique_head`, `no_self_loops`. Output is well-formed or `feasible=False`.
- **Constrained classification** (`Classifier` + implies/excludes).
- **Span attributes** in the same forward pass (sentiment / negation / … on a mention, not document-level).
- **Structured records** (`enable_records=True`) keep instance identity (who bought what).
- CPU-first (`gliner2[local]`). Fastino markets “no GPU required.”

Zero-shot suite (16 datasets, macro F1 vs GLiNER2): Multi **56.17** vs 56.09; Base **54.87** vs 53.34. Headline gain is XNLI (**62.30** vs 37.55 on Multi). Few-NERD Base **55.14** vs 47.22. CrossNER politics **regresses**. Treat as “same family, better NLI + long spans,” not a NER revolution.

Fastino explicitly lists **“knowledge graph construction for agent memory”** as a 2.5 use case.

### 3.2 Mapping onto vmem

A vmem JointIE schema can reuse today’s entity vocabulary and add relations the clique cannot express:

```text
entities: person, organization, place, technology, project
relations:
  works_for   person → organization   unique_head
  member_of   person → organization
  located_in  organization|person → place
  uses        person|project → technology
  part_of     * → project
no_self_loops
```

Span attributes can carry `temporalKind` or negation on the mention. Record mode is a possible later stand-in for atomic facts — **not** the first spike; we still need first-person durable sentences.

Write mapping (Convex stays source of truth):

| GLiNER output | Convex table |
| --- | --- |
| entity mention + type + offsets | `memoryEntities` / `memoryEntityMentions` (keep fallback merge) |
| typed relation | `memoryLinks` with `origin: entity`, `reason` = relation type |
| span attribute | optional fields or mention metadata; do not invent a graph DB |
| document classification | `temporalKind` only if it beats `inferTemporalFields` |

### 3.3 Hosting (the actual P0 blocker)

Convex Node actions cannot load a 194M DeBERTa. Jev-in-Gateway does **not** solve this. Spike order:

1. **Offline script first** (no Convex): `pip install "gliner2[local]"`; `AutoExtractor` + `JointIE` on `eval/corpus.ts` titles/contents + the two-Alice fixture. Compare mention F1 / auto-link count / unplanted multi-hop nDCG vs `extractEntitiesFallback`. Prefer **base** for English.
2. **Then pick a runtime** (only if step 1 wins):
   - Python HTTP sidecar called from a Convex action (store still Convex-only; compute is not).
   - Hosted inference (Hugging Face / Fastino) — another billed API, similar operationally to OpenRouter.
   - Do **not** attempt ONNX-in-Convex or in-process PyTorch on the Convex isolate.

Keep regex fallback as the write-path floor (same contract as today’s LLM enrich: missing sidecar ⇒ fallback, never 422).

### 3.4 What GLiNER should not do

- Rewrite “I’m using TypeScript 5.4 with Bun” into two first-person facts.
- ADD vs UPDATE vs DELETE (#178). That is a decision over existing row IDs — Jev or the current LLM judge.
- Query-time ranking. Too slow/heavy vs BM25+FTS; Jev is the retrieve-side model.

---

## 4. TypeSafe Jev (retrieve gate)

**Primary:** [Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (Diogo Almeida, 2026-09-15).  
**Gateway:** model id **`typesafe-ai/jev`** — [Vercel model page](https://vercel.com/ai-gateway/models/jev), [changelog](https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway) (2026-09-16).  
**Direct API:** `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` (alias; reported as `jev-1.13.0` on the announcement window).  
**SDK:** AI SDK 7 `experimental_evaluate` (`ai@7.0.105+`); `@ai-sdk/typesafe-ai`; Python `typesafe-sdk`.  
**Jaggedness:** [Jev 1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13) (reviewed 2026-09-16).

### 4.1 What it is

Jev is a **System One** model: unstructured `state` + a map of typed `questions` → parallel structured answers with probabilities. It **does not generate strings**. Schema match is guaranteed (outputs are enumerated). Wrong judgments are still possible; calibration exists so **code** owns the threshold.

Primitives (TypeSafe names → AI SDK / Gateway names):

| TypeSafe | Gateway / AI SDK | Returns |
| --- | --- | --- |
| Noul | `boolean` | P(true) in `[0, 1]` |
| Choice | `choice` | selected option + full distribution (≤255 options) |
| Score | `score` | 2–10 ordered levels; probability-weighted mean |

Training: RLCD (calibrated decisions), parallel sampler. Vendor claims (their workflow evals, caveats on the blog): ~70–500ms, **$0.042 / 1M input tokens**, output unmetered, homepage multipliers **193.6× faster / 444.6× cheaper** called “higher end of real-world gains.” Context: 64k tokens for state+questions together; 32k for state + longest question. Pack many questions per call.

Evaluation is **AI SDK / Gateway evaluate only** — not the OpenAI-compatible Gateway chat endpoint. OpenRouter is the wrong pipe.

### 4.2 Access and how a spike should call it

**Usable now.** No waitlist. P0/P1 Jev experiments read env **`TYPESAFE_API_KEY` immediately**.

Where the key lives (names only — never print or commit the value):

| Where | What to do |
| --- | --- |
| **Engineer box (local spikes)** | `TYPESAFE_API_KEY` is already stored in the local environment. Scripts and `curl` / `typesafe-sdk` can run against TypeSafe’s official API without any further access step. |
| **Cloud-agent spikes** | Add `TYPESAFE_API_KEY` to the **saved Cursor environment / secret store** for that environment. Do **not** put the value in the PR, this markdown, `.env.example`, or chat. Until that secret is on the environment, live Jev tests must skip (same pattern as unset `OPENROUTER_API_KEY` → synthetic embeddings). |
| **This repo / PR** | No secrets. Do not request the key. Do not embed it. |

Call path for those local/cloud spikes: **TypeSafe official API** `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer` from `TYPESAFE_API_KEY`, model `jev-latest` (or `typesafe-sdk` / `typeSafeAi.evaluationModel('jev-latest')`, mapping `TYPESAFE_API_KEY` if the SDK’s default name is `TYPESAFE_AI_API_KEY`).

**Optional extra**, only if a Gateway key is also present: Vercel AI Gateway `typesafe-ai/jev` via `experimental_evaluate`, and [vercel-labs/ai-cli](https://github.com/vercel-labs/ai-cli) `ai evaluate` (defaults to that model; needs `AI_GATEWAY_API_KEY`). Gateway is not required for P0/P1 while `TYPESAFE_API_KEY` is set. Zero Data Retention on Gateway: `providerOptions.gateway.zeroDataRetention`.

Env names a spike may **read** (never commit values):

| Name | Role |
| --- | --- |
| `TYPESAFE_API_KEY` | **Canonical for P0/P1.** On the engineer box now; add to the Cursor environment for cloud agents. TypeSafe docs / Python SDK / curl. |
| `TYPESAFE_AI_API_KEY` | `@ai-sdk/typesafe-ai` default. If only `TYPESAFE_API_KEY` is set, alias it in the spike — do not invent a second secret. |
| `AI_GATEWAY_API_KEY` | Optional. Gateway `typesafe-ai/jev` and `ai evaluate`. |
| `JEV_API_KEY` | Optional local alias for `TYPESAFE_API_KEY`. Do not add a Convex dashboard secret under this name unless we later productize it. |

Resolution for scripts: `TYPESAFE_API_KEY` → else `TYPESAFE_AI_API_KEY` → else `JEV_API_KEY` → else `AI_GATEWAY_API_KEY` (Gateway path). If none is set, skip the live Jev test. Do not 422 production retrieve if Jev is missing; the heuristic `#179` threshold stays the floor.

Do **not** paste keys into issues, PRs, logs, or this markdown.

Production later (only if the spike wins): store the chosen key the same way as `OPENROUTER_API_KEY` (`userEnvVars` + `tryUserAndApiKeyByClerkId`), not in the repo.

### 4.3 Fit vs current retrieve

Jev is a **second-stage gate on already-ranked hits**, not a replacement for `rank.ts`. TypeSafe’s own RAG cookbook is “filter in code first, then Noul for relevance.” That matches our FTS/vector pool.

Proposed call (one round-trip, many questions):

```text
state = { query, referenceDate, hits: [{ id, title, content, type, temporalKind, eventStart, eventEnd, score }] }
questions:
  relevant_<id>: boolean  "Is this memory a correct answer to the query (not a lexical trap)?"
  stale_<id>:    boolean  "Does this memory contradict current truth for the query?"
  kind:          choice   current | window | preference | plan | none
```

Then **code** applies `P(relevant) >= t` (calibrate `t` on the 6 labelled abstentions + 12 lexical traps). Keep Context Trace: add `jevRelevant` / `jevConfidence` as extra breakdown fields; do not drop BM25/vector/graph/temporal.

Keep in **code** (Jev 1.13 jaggedness): date window overlap (`temporalScore`), counting, “older than N days,” Jaccard/hash supersede. Send `referenceDate` in state if a question says “today”; still compare ISO timestamps in TypeScript.

Do **not** use Jev to generate fact text, titles, or related-memory IDs. For extraction-shaped work, TypeSafe says: enumerate candidates (regex / GLiNER / LLM) then Choice over them.

Optional later (after the retrieve gate): replace or shadow `factDecision.ts` ADD/UPDATE/DELETE/NONE with a Choice over retrieved candidate IDs. That is a decision task. It is not the first experiment.

### 4.4 vercel-labs/ai-cli

[vercel-labs/ai-cli](https://github.com/vercel-labs/ai-cli) (`npm i -g ai-cli`, Node 22+) is an optional **question-iteration** helper, not required for P0/P1 and not the production runtime.

- `ai evaluate` wraps `experimental_evaluate`. Default model **`typesafe-ai/jev`**. Override with `-m` or `AI_CLI_EVALUATION_MODEL`.
- Stdin → `state`; `--boolean` / `--choice` / `--score` or `--questions triage.json`.
- stdout is the SDK JSON (`answers`, `usage`, `providerMetadata`). Thresholds live in `jq`, not the CLI (`jq -e '.answers.refund.probability >= 0.9'`).
- `ai models --type evaluation` / `ai models typesafe-ai/jev` for catalog + pricing.
- Needs **`AI_GATEWAY_API_KEY`**. The engineer box’s `TYPESAFE_API_KEY` does **not** satisfy this CLI. If only `TYPESAFE_API_KEY` is set, iterate questions with TypeSafe’s official API / `typesafe-sdk` instead.

Use whichever path is keyed to freeze instructions + `t` on labelled query/hit pairs **before** wiring a Convex action. Convex retrieve should call the SDK/API directly, not shell out to `ai`.

---

## 5. Side-by-side vs current extract

| Need | vmem today | GLiNER2.5 | Jev |
| --- | --- | --- | --- |
| Atomic durable fact text | OpenRouter JSON chat | No | No |
| Person/org/project mentions | Regex + optional LLM JSON | Schema NER + offsets + confidence | Choice over **pre-extracted** candidates only |
| Typed relations | Undirected same-entity clique | JointIE, schema-valid graph | No (cannot emit new edge labels as text) |
| Temporal fields | LLM optional + `inferTemporalFields` | Span attributes / classify | Do **not** compare dates in-model |
| ADD/UPDATE/DELETE | Hash + Jaccard + LLM judge | No | Yes (Choice / Boolean) — P1 after retrieve gate |
| Retrieve abstention | Heuristic `threshold` | No | Boolean P(relevant) + code threshold |
| Lexical-trap demotion | Local rerank extra | No | Boolean / Score on `{query, hit}` |
| Latency budget | Sync regex; async LLM enrich | Tens–hundreds of ms on CPU if hosted | 70–500ms vendor; pack questions |
| Convex-native | Yes | **Hosting TBD** | Gateway or TypeSafe HTTP from an action |
| Failure mode | Fallback / 422 on fact extract | Fallback if sidecar down | Skip gate if key missing |
| License / lock-in | OpenRouter | Apache 2.0 weights | Hosted early-access model; price may be subsidized |

---

## 6. Recommendations

Two independent tracks. Do not couple them. P0/P1 Jev experiments use env `TYPESAFE_API_KEY` **immediately** (engineer box; cloud agents only after that name is in the saved Cursor environment). GLiNER starts with an offline accuracy pass, then a hosting choice.

### P0 — Jev retrieve-gate experiment (do immediately)

**Goal:** calibrated relevance / abstention on top of #179, without changing write-time extract.

1. Freeze 1–2 question files (`relevant`, maybe `trap`) against labelled query + top-20 hits from the current ranker. Include abstentions, lexical traps, negations. Prefer TypeSafe official API with `TYPESAFE_API_KEY`; `ai evaluate` only if `AI_GATEWAY_API_KEY` is also present.
2. Script in `packages/backend/tests/memory/` (or `eval/`) that reads **`TYPESAFE_API_KEY` first**, calls `jev-latest` (or Gateway `typesafe-ai/jev` if a Gateway key is set), never prints the key. Skip when unset so cloud agents without the secret still pass.
3. Report: abstention @ `t ∈ {0.5, 0.7, 0.8, 0.9}` vs recall@5 / nDCG@10 on answerable queries; extra latency; cost from `usage.inputTokens`.
4. Accept: a threshold that keeps labelled R@5 ≥ Neo4j bar (92%) **and** drops all 6 abstentions, without a large lexical-trap regression. If no such `t`, keep #179 heuristics and stop.

Implementation sketch if it wins (P1 productize): Convex retrieve action, top 20 only, extra Context Trace fields, missing key ⇒ current ranker. Do not block MCP/HTTP retrieve on Jev.

### P0 — GLiNER on-write spike (separate; hosting still required)

**Goal:** better mentions + typed edges than regex+LLM enrich, feeding the same `memoryEntities` / `memoryLinks` #177 already ranks.

1. Offline JointIE vs `extractEntitiesFallback` on the labelled corpus + Alice two-fact fixture. Metric: mention precision/recall, auto-link count (today CI wants **> 30** unplanted), unplanted multi-hop/project nDCG vs hybrid-no-graph.
2. Only if it wins: choose sidecar vs hosted API; merge with fallback; `origin: entity`; never 422.
3. Do not replace `extractFacts.ts` in this spike.

### P1 — only after the matching P0 wins

- Ship the Jev gate behind `rerank` or a new `gate: "jev"` flag; keep title-join summarize.
- Optional: Jev Choice for `factDecision` ADD/UPDATE/DELETE/NONE (still hash-NONE first).
- Optional: GLiNER span attributes → `temporalKind` vs rules; take whichever wins the temporal ablation.
- MemoryBench / conversation ingest still wait on extract quality, as the competitive brief said.

### Explicit non-goals

- Using Jev or GLiNER to generate memory `content` / titles.
- Asking Jev to do date math, counting, or Jaccard.
- Running GLiNER inside the Convex isolate.
- New graph database.
- Committing, requesting, printing, or embedding API keys (including in PRs). Cloud-agent Jev needs `TYPESAFE_API_KEY` in the saved Cursor environment, not in git.
- Blocking retrieve on either model being configured.

---

## 7. Spike checklist

**Jev (this week — `TYPESAFE_API_KEY` on the engineer box; no waitlist)**

- [ ] Local spike: official API / `typesafe-sdk` with env `TYPESAFE_API_KEY` (do not print it).
- [ ] Cloud-agent spike: confirm `TYPESAFE_API_KEY` is in the saved Cursor environment / secret store; if not, skip live calls. Do not add the value to the PR.
- [ ] Optional: `ai models --type evaluation` / `ai evaluate` only when `AI_GATEWAY_API_KEY` is set.
- [ ] Hand-label ~30 `{query, hit, relevant}` rows from labelled + hard corpora (include 6 abstentions + traps).
- [ ] Iterate instructions; lock `t` in code.
- [ ] Live script skipped-when-unset; no secrets in logs.
- [ ] Write accept/reject in `eval/` next to RESULTS.md.

**GLiNER (parallel, no Jev dependency)**

- [ ] `gliner2.5-base-v1` JointIE on corpus dump.
- [ ] Diff vs fallback; decide hosting only if mention+link quality moves multi-hop.
- [ ] Fallback-merge design unchanged from #177.

---

## 8. Sources

### GLiNER2.5

- https://fastino.ai/blog/gliner2-5-span-free-information-extraction
- https://fastino.ai/models/gliner2-5
- https://github.com/fastino-ai/GLiNER2
- https://huggingface.co/fastino/gliner2.5-base-v1
- https://huggingface.co/fastino/gliner2.5-small-v1
- https://huggingface.co/fastino/gliner2.5-multi-v1
- GLiNER2 paper (architecture family): https://arxiv.org/abs/2507.18546

### TypeSafe Jev

- https://typesafe.ai/blog/introducing-system-one-models-and-jev
- https://docs.typesafe.ai/introduction/quickstart
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/model-jaggedness/jev-1.13
- https://evals.typesafe.ai/
- https://vercel.com/ai-gateway/models/jev
- https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway
- https://vercel.com/docs/ai-gateway/modalities/evaluation
- https://ai-sdk.dev/docs/ai-sdk-core/evaluation
- https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai

### vercel-labs/ai-cli

- https://github.com/vercel-labs/ai-cli
- https://ai-cli.dev/docs/evaluate
- https://ai-cli.dev/docs/models

### vmem (this repo)

- Fact extract: `packages/backend/engine/memory/extractFacts.ts`
- Entity fallback + LLM prompt: `packages/backend/engine/memory/entities.ts`
- Temporal rules: `packages/backend/engine/memory/temporal.ts`
- Fact decision: `packages/backend/engine/memory/factDecision.ts`
- Rank / threshold / rerank: `packages/backend/engine/memory/rank.ts`
- Caps: `packages/backend/engine/memory/retrieveCaps.ts`
- Write + schedule enrich: `packages/backend/convex/memoryRuntime.ts`, `convex/memoryExtract.ts`, `convex/memoryStore/helpers.ts`, `convex/memoryStore/entities.ts`
- Eval: `packages/backend/eval/RESULTS.md`, `eval/labelled-bench.md`
- Competitive roadmap: `packages/backend/tests/memory/competitive-brief.md`
