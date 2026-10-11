# e2e-ab: vmem memory on/off A/B

Measures whether the vmem MCP server plus seeded memories helps a headless Claude Code agent (`claude -p`) answer memory-dependent questions better than the same agent without vmem. One agent turn and one judge turn per trial. Method and fairness rules: `docs/e2e-ab-eval.md`.

**Local only. Never run this in CI.** It spawns `claude`, spends tokens, and writes to a real vmem account. No workflow may call it.

## Run

```bash
# Pipeline check. No claude, no HTTP, no scores.
pnpm --filter @vmem/backend eval:e2e-ab -- --dry-run

# Live
EVAL_E2E_AB=1 VMEM_API_KEY=vmem_sk_... CONVEX_SITE_URL=https://<deployment>.convex.site \
  pnpm --filter @vmem/backend eval:e2e-ab -- --repeats 3
```

Without `EVAL_E2E_AB=1` the CLI refuses a live run. It also needs `claude` on PATH.

| Flag                     | Meaning                                                 |
| ------------------------ | ------------------------------------------------------- |
| `--dry-run`              | Load fixtures, write `result.json`, call nothing        |
| `--repeats <n>`          | Trials per arm per fixture (default 3)                  |
| `--fixture <id-or-path>` | Run a subset. Repeatable                                |
| `--out <path>`           | Result path (default `eval/e2e-ab/results/result.json`) |
| `--model <name>`         | Agent model                                             |
| `--judge-model <name>`   | Judge model                                             |
| `--timeout-seconds <n>`  | Timeout per `claude` call (default 180)                 |

## Environment

| Variable                                       | Use                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `EVAL_E2E_AB=1`                                | Enable the live path                                                                |
| `EVAL_E2E_AB_DRY=1`                            | Same as `--dry-run`                                                                 |
| `EVAL_E2E_AB_REPEATS`                          | Default for `--repeats`                                                             |
| `EVAL_E2E_AB_MODEL`, `EVAL_E2E_AB_JUDGE_MODEL` | Defaults for `--model`, `--judge-model`                                             |
| `EVAL_E2E_AB_TIMEOUT_SECONDS`                  | Default for `--timeout-seconds`                                                     |
| `VMEM_API_KEY`                                 | Bearer key for seeding (`POST /api/v1/memories`)                                    |
| `CONVEX_SITE_URL` or `VMEM_SITE_URL`           | Site URL for seeding                                                                |
| `VMEM_MCP_URL`                                 | MCP URL for the on arm (default `https://clear-bear-690.eu-west-1.convex.site/mcp`) |

The judge model defaults to `sonnet`, or `opus` when the agent model contains `sonnet`.

## Arms

- `off`: `--strict-mcp-config` with `{ "mcpServers": {} }`. Built-in tools off (`--tools ""`).
- `on`: `--strict-mcp-config` with only the `vmem` HTTP server. `--tools ""` is not passed, so MCP tools stay available.

Both arms get the same task prompt, an empty temp working directory, and must end with an `ANSWER:` block. That block is the artifact.

MCP uses Clerk OAuth. API keys do not authenticate `/mcp`. The API key seeds data only. The `on` arm needs `claude` to be able to reach vmem MCP already (complete the OAuth flow once in your normal Claude Code setup).

## Contamination

Every stream-json line is parsed for MCP tool calls (`mcp__<server>__<tool>`, `providerIdentifier`, `serverName`). A server whose name contains a banned fragment (case-insensitive) kills the process and records a `ContaminationError` for that trial. The trial is flagged, excluded from scores, and counted in the table.

Banned on both arms: `mem0`, `supermemory`, `super-memory`, `zep`, `graphiti`, `memorybank`, `memory-bank`, `memgpt`, `letta`, `chatgpt-memory`, `notion`, `raven`, `memos`. Banned on `off` only: `vmem`.

## Judge

A separate `claude -p` call with `--json-schema`, no tools and an empty strict MCP config. It sees the question, acceptance criteria, expected and forbidden facts, and the extracted `ANSWER:` text. It never sees the agent's process. Scores are 0, 25, 50, 75 or 100. Unparseable output gives `score: null` and a judge error. No score is invented.

## Fixtures

`fixtures/*.yaml` (or `.json`, same keys). A small YAML subset is read by `yaml.ts` (maps, lists, `|` blocks, inline `[a, b]` lists, comments), then validated with Zod in `fixture.ts`.

| Key                  | Notes                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | Lowercase, hyphenated, unique                                                                                             |
| `title`, `task`      | Question text                                                                                                             |
| `kind`               | `preference`, `multi-hop`, `update`, `abstention`, `exact-match`, `project`                                               |
| `acceptanceCriteria` | Shown to the judge                                                                                                        |
| `expectedFacts`      | Required unless `kind: abstention`                                                                                        |
| `forbiddenFacts`     | Optional. Facts the answer must not claim                                                                                 |
| `seedMemories`       | `title`, `content`, `type` (`profile`/`episodic`/`knowledge`), `source`, `tags`, `confidence`, optional `createdAt` (ISO) |
| `expectedAbstention` | Must be `true` for `kind: abstention`, and only then                                                                      |

`createdAt` orders the seed POSTs (oldest first). The store API has no `createdAt` field, so the server sets the real timestamp.

Seeds carry `source: e2e-ab` and the tag `e2e-ab:<fixtureId>`. They stay in the account after a run. Use a dedicated eval account so other memories do not leak into the `on` arm. Remove old seeds by tag.

## Output

A terminal table and `result.json` (gitignored under `results/`). Per arm: mean score, sample stddev, min and max, mean cost (USD), mean input plus output tokens, mean latency (ms), contamination count, judge-error count, agent-error count. Also per-fixture means and the delta (on mean minus off mean, in points). A trial with no `ANSWER:` block, a timeout or a non-zero exit counts as an agent error and is not scored.

## Files

`cli.ts` argv. `run.ts` orchestration. `claude.ts` spawn (injectable). `stream.ts` NDJSON parser. `guard.ts` contamination. `prompts.ts` task, judge, answer extraction. `judge.ts` schema. `seed.ts` HTTP seed. `aggregate.ts`, `report.ts` summaries. Tests: `tests/memory/e2e-ab.test.ts`.

Ideas adapted from `unblocked/context-engine-simulator` (MIT, Copyright 2026 Unblocked), https://github.com/unblocked/context-engine-simulator.
