# vmem effectiveness evaluation (publishable protocol)

**Goal:** reproducible “does vmem help Claude?” numbers you can share.

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
