# End-to-end memory on/off A/B eval

This eval asks one question. Does a headless Claude Code agent answer memory-dependent questions better with vmem MCP and seeded memories than without them? The IR evals in `packages/backend/eval/` measure retrieval only. This one measures the answer the agent gives.

Run it: `packages/backend/eval/e2e-ab/README.md`. It is local only and never runs in CI.

## Method

1. Load fixtures (`task`, `acceptanceCriteria`, `expectedFacts`, `forbiddenFacts`, `seedMemories`).
2. Seed each fixture into vmem over `POST /api/v1/memories` (`source: e2e-ab`, tag `e2e-ab:<fixtureId>`).
3. For each fixture and repeat, run two trials with `claude -p`: `off` (no MCP servers) and `on` (only vmem).
4. Extract the final `ANSWER:` block from each trial.
5. A separate judge call scores that block 0, 25, 50, 75 or 100 against the criteria and expected facts.
6. Aggregate per arm and report the delta, on mean minus off mean.

Fixtures cover a durable preference, a multi-hop join, a stale fact with a later correction, abstention, an exact code among lookalikes, and a project retrieved without its codename.

## Fair A/B rules

- Same task prompt in both arms. It names no memory tool.
- `--strict-mcp-config` in both arms. `off` has an empty server list. `on` has vmem only.
- Built-in tools are off and the working directory is an empty temp directory. The agent cannot read the fixture files.
- The judge scores the `ANSWER:` text only. It has no tools and no MCP.
- Other memory servers are banned in both arms. `vmem` is also banned in `off`. A banned call aborts the trial as a `ContaminationError`. The trial is flagged and not scored.
- Judge output that fails the schema gives no score. Nothing is invented.
- Repeats (default 3) show run-to-run spread. Compare the delta with the spread before drawing a conclusion.

## Limits

- MCP uses Clerk OAuth. API keys do not authenticate `/mcp`. The API key seeds data only. The `on` arm needs Claude Code to reach vmem MCP already.
- Retrieval runs over the whole account. Use a dedicated eval account, or other memories can change the `on` result.
- Seeds persist after a run. Remove them by the `e2e-ab:<fixtureId>` tag.
- The store API sets `createdAt`. Fixture `createdAt` only orders the POSTs, oldest first.
- Claude Code settings outside the repo (user-level `CLAUDE.md`, auto memory) can still reach the `off` arm. Run from a clean profile for a strict test.
- Six fixtures give a small sample. Treat results as a signal, not a benchmark.

## Reading the scores

- Score 100 means all criteria and expected facts, and for abstention an honest "not found".
- A positive delta means vmem helped on this fixture set. A delta inside the stddev is noise.
- Abstention checks the other direction. A low `on` score there means vmem led the agent to invent an answer.
- Check `contaminated`, `judge errors` and `agent errors` first. A high count means the means rest on fewer trials (see `scored`).
- A dry run has no scores. It only checks the pipeline.

## Attribution

The two-arm layout, fixture file, independent judge, artifact-only scoring, stream-json guard and `ContaminationError` adapt ideas from `unblocked/context-engine-simulator` (MIT, Copyright 2026 Unblocked), https://github.com/unblocked/context-engine-simulator. This harness does Q&A recall, not coding-agent plan, review or implement.
