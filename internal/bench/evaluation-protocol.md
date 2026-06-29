# vmem effectiveness evaluation (publishable protocol)

**Goal:** reproducible “does vmem help Claude?” numbers you can share.

## Vendor-format multi-benchmark harness (`bench:vendor`) — LoCoMo / LongMemEval / BEAM

Follows the established vendor protocol (Mem0, Supermemory): **memory system retrieves →
reader answers → fixed judge → absolute LLM-judge accuracy (J)**, with a full-context oracle
ceiling and **no no-memory arm**. One harness (`run.ts`, via `--benchmark`) covers all three
third-party benchmarks by mapping each into the shared `LocomoConversation` shape
(`neo4j-cli/bench/benchmarks.ts`).

| Knob       | Setting                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Arms       | `vmem` (production `retrieveMemories`) + `full-context` (oracle)                                                  |
| Reader     | Claude `sonnet` via the CLI (Max-plan quota)                                                                      |
| Judge      | `gpt-4o-mini` via OpenRouter (fixed; ~$0.0004/q). `--judge-model openai/gpt-4o` for tighter vendor matching       |
| Ingest     | vmem full pipeline on the free `gpt-oss-20b` model ($0, off the Max plan); both user + assistant turns            |
| Isolation  | per-conversation synthetic `userId` — retrieval can’t leak across items                                           |
| Abstention | `_abs` / BEAM abstention rows graded by an abstention-aware judge, reported separately (excluded from headline J) |

```bash
cd packages/backend
# BEAM 100K (most tractable: ~3 sessions/conv after chunking; 8/10 abilities gold-graded)
pnpm bench:download:beam -- --split 100K
pnpm bench:vendor -- --benchmark beam --conversations 3 --run-id beam-vendor
pnpm bench:report -- --run-id beam-vendor --benchmark beam --answer-model claude:sonnet --judge-model openai/gpt-4o-mini

# LongMemEval-S (stratified, indicative slice — NOT the full 500)
pnpm bench:download:longmemeval
pnpm bench:vendor -- --benchmark longmemeval --stratified-sample 50 --seed 123 --run-id lme-vendor
pnpm bench:report -- --run-id lme-vendor --benchmark longmemeval --answer-model claude:sonnet --judge-model openai/gpt-4o-mini --seed 123

# Cleanup after a run
pnpm bench:cleanup --prefix bench_beam_        # or --prefix bench_longmemeval_
```

**Output:** `packages/backend/neo4j-cli/bench/results/<run-id>.jsonl` (resumable journal) +
`internal/bench/<benchmark>-results.md` (headline J, % of oracle, per question_type, abstention).

**Comparability:** absolute J is **directionally comparable, not strict leaderboard parity** —
we use a Claude reader + gpt-4o-mini judge vs the vendors’ gpt-4o-mini reader + gpt-4o judge, a
different memory system, and (for LongMemEval) only a slice. Every report carries a banner saying
so. **Notes:** LongMemEval ingest is heavy (~40 sessions/item) — use the stratified slice, not the
full 500. BEAM’s HF rows serialise `probing_questions` as a Python-literal dict (parsed by
`datasets/pythonLiteral.ts`); its `instruction_following` + `preference_following` abilities are
rubric-graded (no gold answer) and excluded, leaving 8 of 10 abilities.

## Primary path: full LoCoMo + Claude CLI (recommended)

Uses the **same harness** as `bench:locomo` (ingest → retrieve → answer → judge) but routes answer + judge through **`claude -p`** instead of OpenRouter. vmem arm uses production `retrieveMemories` + `buildAnswerPrompt` (engine path, comparable to Mem0).

| Condition        | How                                                                  |
| ---------------- | -------------------------------------------------------------------- |
| **no-memory**    | Empty retrieval context → Claude answers                             |
| **vmem**         | Production Neo4j retrieval → Claude answers                          |
| **full-context** | Entire LoCoMo transcript in prompt → Claude answers (oracle ceiling) |

**Judge:** Claude CLI + shared `judgePrompt.ts` (same seven rules as OpenRouter harness).

### Run (full dataset)

```powershell
$env:VMEM_BENCH_CLERK_ID = "<your-clerk-id>"   # optional; scopes vmem ingest to your account

# All 10 conversations, all questions (~1.5k QA rows × 3 providers):
pwsh -File internal/bench/claude-locomo-bench.ps1 -RunId publish-claude-2026

# Smoke test:
pwsh -File internal/bench/claude-locomo-bench.ps1 -Conversations 1 -MaxQuestions 20 -FastIngest
```

Or directly:

```bash
cd packages/backend
pnpm bench:locomo:claude -- --providers no-memory,vmem,full-context --user <clerkId> --run-id publish-claude
pnpm bench:report -- --run-id publish-claude
```

**Output:** `packages/backend/neo4j-cli/bench/results/<run-id>.jsonl` + `internal/bench/locomo-results.md`

**Ingest:** vmem still uses OpenRouter for extract/embed/enrich — that is setup, not the scored answer path.

### Legacy: Claude MCP smoke test (`-McpMode`)

For “Claude Code + vmem HTTP MCP connector” product claims (not engine retrieval):

```powershell
pwsh -File internal/bench/claude-locomo-bench.ps1 -McpMode -Conversations 1 -MaxQuestions 20
```

**Output:** `internal/bench/claude-locomo-results.md` (MCP-specific; small N by design)

### Codebase token bench (secondary)

`internal/bench/claude-token-bench.ps1` — explore (Read/Grep) vs vmem MCP on **repo** questions. Measures tokens/cost, not LoCoMo recall. See `claude-token-results.md`.

---

## Secondary path: OpenRouter harness (engine QA, CI)

For **production engine** regression without Claude billing:

```bash
cd packages/backend
pnpm bench:locomo --providers no-memory,vmem,full-context ...
pnpm bench:report --run-id <id>
```

Same LoCoMo **J** metric with OpenRouter answer+judge — useful for CI. Mix backends: `--answer-backend claude --judge-backend claude` (or `pnpm bench:locomo:claude`).

---

## What to publish

Lead with **Claude LoCoMo lift** on the full harness (memory-dependent subset preferred):

> On LoCoMo (memory-dependent questions), Claude **with vmem** scored **X%** vs **Y%** without (**+Z pp**), reaching **W%** of the full-transcript oracle.

For MCP-connector claims, cite `-McpMode` results separately (see `vmem-native-protocol.md`).

Add token/cost table from the same run. Put vendor claims in `comparator-claims.md` only.

## Improvement backlog

- [x] Full LoCoMo harness with Claude CLI (`bench:locomo:claude`)
- [ ] Multi-conversation full LoCoMo Claude run (10 conv, publish numbers)
- [ ] vmem-real corpus (realistic saves, not fiction) — see `vmem-native-protocol.md`
- [ ] Revisit-task protocol + retrieval hit@k audit
- [ ] Phase 2: mem0/supermemory under OpenRouter harness for vendor comparison
