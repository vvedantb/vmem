# vmem effectiveness evaluation (publishable protocol)

**Goal:** reproducible “does vmem help Claude?” numbers you can share.

## Primary path: Claude Code (what you asked for)

| Condition     | How                                                                    |
| ------------- | ---------------------------------------------------------------------- |
| **no-memory** | `claude -p --bare` + MCP disabled — disconnected chat                  |
| **vmem**      | `claude -p` + vmem HTTP MCP only — `memory_retrieve` / `memory_search` |

**Benchmark:** LoCoMo QA (public dataset). **Judge:** Claude (`claude -p`), not OpenRouter.

### Run

```powershell
$env:VMEM_BENCH_CLERK_ID = "<your-clerk-id>"   # memories must be on this account for MCP

pwsh -File internal/bench/claude-locomo-bench.ps1 `
  -Conversations 1 -MaxSessions 5 -MaxQuestions 10

# Re-run QA only if already ingested:
pwsh -File internal/bench/claude-locomo-bench.ps1 -SkipIngest -MaxQuestions 10
```

**Output:** `internal/bench/claude-locomo-results.md` + `claude-locomo-runs.csv`

**Ingest note:** the first step still uses `bench:locomo` (OpenRouter) to write memories into Neo4j under your Clerk id — that is setup, not the scored answer path. Answers and judging are 100% Claude Code.

### Codebase token bench (secondary)

`internal/bench/claude-token-bench.ps1` — explore (Read/Grep) vs vmem MCP on **repo** questions. Measures tokens/cost, not LoCoMo recall. See `claude-token-results.md`.

---

## Secondary path: OpenRouter harness (engine QA, not Claude)

For **production engine** regression without Claude billing:

```bash
cd packages/backend
pnpm bench:locomo --providers no-memory,vmem,full-context ...
pnpm bench:report --run-id <id>
```

Same LoCoMo **J** metric, but answer+judge models are OpenRouter — useful for CI, not for “Claude with connector” claims.

---

## What to publish

Lead with **Claude Code LoCoMo J**:

> On LoCoMo, Claude **with vmem MCP** scored **X%** vs **Y%** with MCP off (**+Z pp**), using Claude as judge.

Add token/cost table from the same run. Put vendor claims in `comparator-claims.md` only.

## Improvement backlog

- [ ] Multi-conversation full LoCoMo (10 conv) Claude run
- [ ] Optional claude.ai parity (manual — no `claude -p` on web)
- [ ] Phase 2: mem0/supermemory under OpenRouter harness for vendor comparison
