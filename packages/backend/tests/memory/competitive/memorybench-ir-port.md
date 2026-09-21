# MemoryBench → vmem labelled IR port

Investigation of whether SuperMemory’s [MemoryBench](https://github.com/supermemoryai/memorybench) can supply **competitive signal without paying for gpt-4o answer + judge** (and without Mem0/SuperMemory keys on the default path). Goal: improve vmem’s existing labelled IR harness (`packages/backend/eval/*`, recall@k / MRR / nDCG@10), not replicate MemScore.

## Verdict: **partial**

Full MemoryBench parity **without an LLM is impossible**. Their headline metric is binary answer correctness (`MemScore` = `quality% / latencyMs / contextTokens`), produced by:

1. ingest sessions into a vendor
2. search
3. **LLM answer** (default gpt-4o) over retrieved context
4. **LLM judge** (default gpt-4o) vs free-text ground truth
5. optionally a **third LLM pass** that grades each search hit as relevant given the expected answer ([`retrieval-eval.ts`](https://github.com/supermemoryai/memorybench/blob/main/src/orchestrator/phases/retrieval-eval.ts))

That quality% is not recall@k. Multi-hop / open-domain / adversarial questions need synthesis, commonsense, or an abstention decision that retrieval ranking cannot score.

An **IR-proxied MemoryBench** **is** viable and is enough for engineering iteration:

- LoCoMo (start here) already annotates **supporting utterance IDs** (`qa[].evidence` → `dia_id` like `D1:3`).
- Those IDs resolve to deterministic gold hit sets for **1973 / 1986** questions after a tiny evidence-token cleanup (counts from `locomo10.json` on 2026-09-18; not a model score).
- Map each turn → one vmem episodic memory, each question → `RetrievalEvalQuery`, reuse `runCorpusAblation` / `metrics.ts`.
- Default CI path: **zero LLM, zero vendor keys**, synthetic embeddings (same as `eval:bench`).

**Recommendation:** ship LoCoMo-IR as the competitive-ish loop; do **not** run full LoCoMo/LongMemEval MemoryBench (answer+judge) for day-to-day ranking work. Optional later hybrid: IR always, plus a tiny paid judge sample (n≈20) only when we need a MemScore-shaped number for a blog/vendor comparison.

## Gold labels that support retrieval (no free-text judge)

### LoCoMo (`locomo10.json`, 10 conversations, 1986 QA)

| Field                      | What it is                                                      | IR use                                                  |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| `conversation.session_N[]` | Turns with `speaker`, `dia_id`, `text`, optional `blip_caption` | One memory per turn                                     |
| `session_N_date_time`      | `"1:56 pm on 8 May, 2023"`                                      | `createdAt` / `eventStart`                              |
| `qa[].evidence`            | Gold turn IDs (`D{session}:{turn}`)                             | Gold hit set                                            |
| `qa[].category`            | Integer 1–5                                                     | Query type (see mapping below)                          |
| `qa[].answer`              | Free-text / number                                              | **Not** used for IR; needed only for LLM answer judging |
| `qa[].adversarial_answer`  | Tempting wrong answer (cat 5)                                   | Ignore for IR                                           |

Measured on the published file (dataset stats, not vmem scores):

| Category ID | Type (from LoCoMo `task_eval/evaluation.py`) | Questions | Evidence resolved to `dia_id` |
| ----------- | -------------------------------------------- | --------- | ----------------------------- |
| 1           | multi-hop                                    | 282       | 278                           |
| 2           | temporal                                     | 321       | 320                           |
| 3           | world-knowledge (open-domain)                | 96        | 89                            |
| 4           | single-hop                                   | 841       | 840                           |
| 5           | adversarial                                  | 446       | 446                           |
|             | **total**                                    | **1986**  | **1973**                      |

Also: 4 questions with empty `evidence` (all cat 3); 9 with IDs that do not match a turn (some are packed strings like `"D8:6; D9:17"` or `"D9:1 D4:4 D4:6"`, which the loader splits). After split-and-resolve, remaining skips are **empty-evidence** or **true missing IDs** — marked `needs-LLM` / skipped, never scored as 0 recall.

Utterance counts per conversation: 369–689 turns (272 sessions, all session clocks parse). Haystack for a question is **that conversation**, not all 10.

**Do not use MemoryBench’s `CATEGORY_TO_TYPE`.** Their LoCoMo adapter maps `2→multi-hop`, `3→temporal`, `4→world-knowledge`. The paper’s _prose order_ (single-hop, multi-hop, temporal, open-domain, adversarial) is also **not** the JSON IDs. The released eval code and independent writeups agree on:

`1=multi-hop, 2=temporal, 3=open-domain, 4=single-hop, 5=adversarial`

([snap-research/locomo#29](https://github.com/snap-research/locomo/issues/29), [MemMachine LoCoMo table](https://memmachine.ai/blog/2025/09/memmachine-reaches-new-heights-on-locomo/)). vmem uses that map.

### LongMemEval (do not ingest in this PR)

Original dataset (not MemoryBench’s stripped copy):

| Field                                   | IR use                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `answer_session_ids`                    | Session-level gold                                                            |
| `haystack_sessions[*][turn].has_answer` | Turn-level gold                                                               |
| `question_type`                         | `single-session-*`, `multi-session`, `temporal-reasoning`, `knowledge-update` |
| Abstention (~30)                        | Skip for recall (upstream retrieval eval does this)                           |

MemoryBench’s LongMemEval loader **deletes `has_answer`** when splitting files and **does not keep `answer_session_ids`** in `UnifiedQuestion.metadata`. Their “retrieval” numbers on this set are the LLM relevance judge, not session-ID recall. A vmem port should read the HuggingFace JSON **without** stripping those fields.

Ingest is much larger than LoCoMo: each of 500 questions has its own haystack (~40 sessions on `_s`, ~500 on `_m`). Start with a `-l` subset or `longmemeval_oracle.json` (evidence sessions only).

### ConvoMem (later)

| Field                                    | IR use                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `message_evidences: { speaker, text }[]` | Gold utterances (match speaker+text; no stable IDs)                                                                   |
| `conversations[].messages`               | Haystack (per question, not shared)                                                                                   |
| category folder names                    | `user_evidence`, `preference_evidence`, `changing_evidence`, `implicit_connection_evidence`, `abstention_evidence`, … |

Abstention has no positive gold — same pattern as labelled-bench empty `expectedTitles`. Implicit-connection / changing facts still need synthesis to _answer_.

## Proposed LoCoMo → vmem eval schema

Per conversation (`sample_id`):

| LoCoMo                                  | vmem labelled IR                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| turn `dia_id` + `text` (+ BLIP caption) | `BenchmarkMemory` `type: "episodic"`, unique `title` = `{sample_id}/{dia_id}` |
| `session_N_date_time`                   | `createdAt` + `eventStart`, `temporalKind: "event"`                           |
| `qa.question`                           | `RetrievalEvalQuery.query`                                                    |
| resolved `qa.evidence`                  | `expectedTitles` + `relevance[title]=3`                                       |
| `qa.category`                           | `query.type` via the evaluation.py map                                        |
| unresolvable / empty evidence           | skip (`empty-evidence` / `unresolved-evidence`); **not** scored as misses     |
| planted `memoryLinks`                   | none (LoCoMo has no gold edges)                                               |

Retrieve **only within that conversation’s memories** (MemoryBench uses a per-question container; we avoid mixing conv-26 with conv-50). `-l N` takes the first N _IR-scorable_ questions in file order and keeps the **full** haystack for those samples.

Flags (not skipped): `needsSynthesis` (cat 1), `needsWorldKnowledge` (cat 3), `adversarial` (cat 5). They still have gold spans. IR can say “we retrieved the right turns”; it cannot say “we would have answered correctly / abstained.”

Code: `packages/backend/eval/locomo/*`. Run:

```bash
pnpm --filter @vmem/backend eval:locomo-ir
LOCOMO_IR_LIMIT=32 pnpm --filter @vmem/backend eval:locomo-ir
LOCOMO_IR_LIMIT=all LOCOMO_IR_ABLATION=1 pnpm --filter @vmem/backend eval:locomo-ir

# Full 1986-Q, hybrid only (default retrieve judge)
LOCOMO_IR_LIMIT=all pnpm --filter @vmem/backend eval:locomo-ir

# Full 1986-Q, Jev rerank of retrieve candidates (same as prod retrieve)
LOCOMO_IR_LIMIT=all LOCOMO_IR_JUDGE=jev pnpm --filter @vmem/backend eval:locomo-ir
```

`eval:locomo-ir` sets `EVAL_LOCOMO_IR=1`, downloads/caches `locomo10.json` (~2.8 MB, gitignored), scores default **8** questions. `LOCOMO_IR_JUDGE=off|jev` (default **`off`**) is passed through to `runCorpusAblation` as `judge`. Gold `dia_id` scoring stays deterministic — Jev only reranks retrieve candidates before IR metrics (not MemScore / LLM answer judge).

`LOCOMO_IR_JUDGE=jev` needs `TYPESAFE_API_KEY` (or the same aliases as prod: `TYPESAFE_AI_API_KEY` / `JEV_API_KEY`) to actually call System One. Fail-open matches prod retrieve: missing key or Jev HTTP/parse failure keeps the hybrid ranking (no 422, no mock numbers). That is **not** `EVAL_JEV`’s fail-closed labelled comparison. `pnpm test` keeps the mapping + fixture retrieve tests **offline**. No `OPENAI_API_KEY` / `MEM0_API_KEY` / `SUPERMEMORY_API_KEY`. Do not commit locomo10 metrics or secrets.

## What to keep from MemoryBench vs skip

**Keep (ideas / URLs, reimplemented — do not vendor the repo):**

- LoCoMo download URL (`snap-research/locomo` `data/locomo10.json`) and session-clock parser
- Phase split: ingest (here: convert turns → memories) → search (here: `rankEvalRetrieve`) → report latency
- Question-type taxonomy (with the **corrected** LoCoMo IDs)
- Later: LongMemEval / ConvoMem download URLs from their adapters

**Skip (LLM-only or not needed for IR):**

- Answer prompts, answering model, `OPENAI_API_KEY`
- Judge prompts, judge-agnostic swap, MemScore **quality%**
- LLM `calculateRetrievalMetrics` (Hit@K where `totalRelevant = max(1, relevantRetrieved)` — that “recall” is hit-rate, not labelled recall)
- Provider adapters (supermemory / mem0 / zep) — already covered by `tests/memory/competitive/` on the **synthetic labelled** corpus
- Per-question checkpointing / web UI
- Ingesting the same conversation 199 times (once per question) into a hosted vendor

MemoryBench already _has_ an IR-shaped report table, but it is **not** gold-ID IR. Using their Hit@K as if it were our nDCG@10 would mix two different measurements.

## Cost comparison (estimates, not measured runs)

Assumptions: gpt-4o list-ish ~\$2.50 / 1M input, ~\$10 / 1M output; MemoryBench README example ~1823 context tokens; **3 LLM calls/question** (answer + judge + retrieval-eval). These are order-of-magnitude planning numbers, **not** benchmark results.

| Path                                    | LLM calls                                        | Rough LLM \$                                                                                   | Keys                                            | What you get                                            |
| --------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| MemoryBench LoCoMo full (~1986 Q)       | ~6k                                              | **tens of dollars** (often \$30–80 with retries/fatter contexts) + hours of ingest/rate limits | OpenAI/Anthropic/Google **and** a memory vendor | MemScore quality% (answer correctness)                  |
| MemoryBench LongMemEval (500 Q)         | ~1.5k                                            | **lower LLM \$ than LoCoMo, much heavier ingest** (per-Q haystack)                             | same                                            | same, plus session-recall _if_ you restore dropped gold |
| MemoryBench “retrieval metrics”         | extra LLM per Q                                  | folded into the rows above                                                                     | judge key                                       | Hit@K / fake-recall via LLM relevance                   |
| **This LoCoMo-IR default**              | **0**                                            | **\$0** (synthetic embeddings)                                                                 | none                                            | labelled recall@k / MRR / nDCG@10 + search latency      |
| LoCoMo-IR + Jev (`LOCOMO_IR_JUDGE=jev`) | 1 System One call / query (retrieve rerank only) | TypeSafe Jev, not gpt-4o answer+judge                                                          | `TYPESAFE_API_KEY` (fail-open without it)       | same IR metrics after prod-like Jev rerank              |
| LoCoMo-IR + OpenRouter embeds           | 0 chat                                           | ~cents (`text-embedding-3-small` on ~0.5–6k texts)                                             | `OPENROUTER_API_KEY` optional                   | same IR, better vectors                                 |
| Smallest hybrid                         | 20–50 judge calls on a fixed sample              | a few dollars, once                                                                            | OpenAI                                          | IR ranking + a tiny quality% sanity check               |

Paying for full answer+judge does **not** help iterate the Convex ranker; IR does. Paying for a 20-Q judge slice is only justified when someone needs a number that can sit next to a vendor MemScore blog post — and even then it is a **different metric**.

## Gaps (IR will look good while answers still fail)

- **Multi-hop (cat 1, 282 Q):** gold is _all_ evidence turns. Retrieving them ≠ composing the answer (MemoryBench splits multi-hop F1 over sub-answers).
- **World-knowledge (cat 3, 96 Q):** evidence is a hook; the answer needs commonsense not in the turn.
- **Adversarial (cat 5, 446 Q):** evidence is the _trap_. IR rewards retrieving it; the correct _answer_ is abstain. We still score IR (span exists) and label `adversarial`.
- **Temporal (cat 2):** session timestamps are on the memory; questions like “when did X” may need date math the ranker does not perform. IR checks we surfaced the turn that _contains_ the cue.
- **Granularity:** utterance memories are the right gold unit. Session-level memories would make R@k easier and hide which turn mattered. Product vmem extracts facts, not raw turns — this bench is **oracle-chunked dialog**, closer to “did retrieve surface the right episode” than to extract-then-retrieve.
- **No gold memory IDs from vendors.** Competitive HTTP IR vs Mem0/SuperMemory on LoCoMo would need a separate span-matching layer (the labelled-corpus harness in #188 already does title matching on _our_ synthetic rows).
- **Headline incomparability.** Mem0 LoCoMo 92.5 / SuperMemory LoCoMo P@1 59.7 / MemoryBench MemScore **cannot** be subtracted from LoCoMo-IR nDCG@10.

## Expanding to LongMemEval later

1. Download `longmemeval_s_cleaned.json` (MemoryBench URL) **or** the original `longmemeval_s.json` (keeps `answer_session_ids`).
2. **Do not** delete `has_answer`. Prefer turn-level gold when present; else session-level `answer_session_ids`.
3. One `LocomoIrSample`-like object **per question** (haystacks are not shared).
4. Skip the ~30 abstention items for recall means (upstream retrieval eval).
5. Default `-l 8` again; full 500 × ~40 sessions is a dedicated nightly, not CI.
6. Same `runCorpusAblation`. Default `judge: "off"`; optional `LOCOMO_IR_JUDGE=jev` reranks retrieve candidates only. Still no answer/MemScore judge.

ConvoMem: match `message_evidences` by speaker+text onto ingested messages; treat `abstention_evidence` as empty gold.

## This PR’s scaffold

| Piece                            | Role                                                                       |
| -------------------------------- | -------------------------------------------------------------------------- |
| `eval/locomo/load.ts`            | Download/cache `locomo10.json`                                             |
| `eval/locomo/convert.ts`         | Turns → memories, evidence → gold titles                                   |
| `eval/locomo/run.ts`             | `eval:locomo-ir`, limit + `LOCOMO_IR_JUDGE` parsing, report                |
| `eval/locomo/fixture.ts`         | Offline schema fixture (not locomo10 scores)                               |
| `tests/memory/locomo-ir.test.ts` | Mapping + fixture retrieve always; live `-l` smoke when `EVAL_LOCOMO_IR=1` |

No locomo10 metrics are committed. Paste stdout from `eval:locomo-ir` only after a real run.
