# frontiermemory: offline benchmark mode for dreaming

Turns a folder of past agent trajectories into a memory folder for the [FrontierMemory](https://www.frontiermemory.com/blog/v1/) dream stage (Letta Research, October 2026). A fixed task agent later reads the folder with shell and grep.

**Local only.** No Convex, no vmem account. It does not change production Dream Mode (`convex/dream*.ts`, `dreaming.ts`, `nightly.ts`). The only network traffic is the LLM calls to the AI Gateway, and `--dry-run` makes none.

## Run

```bash
# Normalise and group, print stats and a cost estimate. No LLM calls.
pnpm --filter @vmem/backend eval:frontiermemory -- \
  --input ./inputs --out ./memory --dry-run

# Live. Hard cap of $1 by default.
AI_GATEWAY_API_KEY=... pnpm --filter @vmem/backend eval:frontiermemory -- \
  --input ./inputs --out ./memory --budget-usd 1
```

The CLI prints a JSON summary at the end. It also writes the summary to `<work>/summary.json`.

| Flag                        | Meaning                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `--input <dir>`             | Trajectory folder (`tNNNN.json` / `.jsonl`)                                         |
| `--out <dir>`               | Memory folder. A folder with a `MEMORY.md` is replaced; other content stops the run |
| `--work <dir>`              | Episode store, LLM cache, call log (default `<out>.work`)                           |
| `--tasks <ids>`             | Comma list of public task ids. Keeps only groups matched to them                    |
| `--tasks-file <path>`       | Task list (default `tasks.json` here)                                               |
| `--max-runs <n>`            | Read at most n files, sorted by name                                                |
| `--budget-usd <n>`          | Hard cap on spend (default 1)                                                       |
| `--dry-run`                 | No LLM calls                                                                        |
| `--no-llm-merge`            | Deterministic merge. Lesson extraction still calls the LLM once per run             |
| `--model <id>`              | Gateway model (default `AI_GATEWAY_CHAT_MODEL`, the dreaming model)                 |
| `--price-in`, `--price-out` | $/M tokens for estimates (defaults 0.1 and 0.4, **assumed, not verified**)          |
| `--concurrency <n>`         | LLM calls in flight (default 8)                                                     |
| `--max-tokens-per-run <n>`  | Trim cap per run, chars/4 (default 6000)                                            |
| `--max-file-bytes <n>`      | Size cap per memory file (default 16000)                                            |

## Pipeline

Each stage is its own module. Stages 1–3 and the first merge pass are pure, so they can move into Dream Mode later.

1. `normalize.ts`: sniffs the format (ATIF, Claude Code, Codex, OpenCode, ACP, else a generic walk for `{role, content}` nodes). Output is a `NormalizedRun`: task prompt (first real user message; harness boilerplate is skipped), later user messages as feedback (tool results and the verifier message are excluded), the last assistant text turns, the verifier outcome, the earliest timestamp as an order hint, and an approximate token count. The text is trimmed to the cap: prompt head up to 40%, newest feedback up to 30%, then the newest assistant turns.
2. `group.ts`: scores each prompt against `tasks.json` (idf-weighted token overlap; id and title count 60%). It also clusters prompts by 3-word shingle Jaccard. A run's own match wins; otherwise it takes its cluster's majority match; otherwise its cluster becomes a `cluster-*` group.
3. `episodes.ts`: one episodic record per run in `<work>/episodes.jsonl`. Secrets are redacted before the text leaves the machine.
4. `lessons.ts`: one LLM call per run. The reply is strict JSON lessons (`lesson`, `kind`, `outcome_link`, `scope`, `evidence`, `supersedes`). The prompt tells the model to learn from FAIL as well as PASS and to leave out run-specific ids. Results are cached per run hash, model and prompt version.
5. `merge.ts`: per group. The deterministic pass dedupes lessons, weights them by outcome (PASS lessons and FAIL pitfalls up), drops one-run task-specific or run-specific lessons (not preferences), and applies newest-wins supersession to preferences. The optional LLM pass rewrites survivors as imperative instructions and 0–3 skills. Any failure keeps the deterministic result.
6. `export.ts`: writes `MEMORY.md` (one line per topic and skill), `topics/<group>.md` and `skills/<name>/SKILL.md`. Every skill description starts with "Use when". Secrets are redacted and each file is capped.

`llm.ts` holds the injectable client, the budget, the per-call log (`<work>/llm-calls.jsonl`) and the file cache. `pipeline.ts` runs the stages in order.

## Model, cost and budget

- Calls go through `generateGatewayText` in `engine/llm/aiGateway.ts`. That adds the flex service tier (`FLEX_GATEWAY_PROVIDER_OPTIONS`). Calls also pass `THINKING_OFF`.
- `AI_GATEWAY_API_KEY` is read when a call is made, not at start-up.
- Cost per call is the Gateway-reported cost (`providerMetadata.gateway.cost`, else `marketCost`). If the Gateway gives no cost, the call is priced from token counts with `--price-in` / `--price-out`; `estimatedCostCalls` in the summary counts those calls.
- Before each call the CLI adds an estimate (prompt chars/4, plus 800 output tokens for a lesson call or 1500 for a merge call) to the running cost and the calls in flight. If that passes `--budget-usd`, the call is not sent. Runs without lessons still export; `llm.budgetHit` is then `true`. A call that costs more than its estimate can still take the total past the cap by that difference.
- Cached calls are free. A rerun retries only runs that got no lessons.

## Limits

- `tasks.json` has 3 of the 15 public tasks: the ones the Letta post names (`build-word2vec-pipeline`, `cattrs-compositional-changelog`, `apex-eurogrid-curtailment`). Titles and descriptions are paraphrased from the post. Only the word2vec source (BigCodeBench) is stated; the other two say `unspecified`. Add the other 12 when the task list is public. Runs for those tasks still form `cluster-*` groups.
- The default prices are assumptions. Check the Gateway price for the model before you trust `--dry-run` estimates.
- The trajectory formats are parsed best-effort from public descriptions of each format. Check `formats` in the dry-run summary against the real inputs: many `generic` runs mean a format was not recognised.
- Parsing is about 2 s for a 4 MB file, because every JSON node is checked with zod.

## Tests

`pnpm --filter @vmem/backend test -- tests/frontiermemory`. The fixtures in `tests/frontiermemory/fixtures` are small synthetic runs, one per format. Tests use a fake LLM client and make no network calls.
