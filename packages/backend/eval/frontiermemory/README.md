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

The CLI prints a JSON summary at the end. A live run also writes the summary to `<work>/summary.json` and the per-call log to `<work>/llm-calls.jsonl`. Both are written even when a later stage throws, so spend is never lost; `output` is then `null`.

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
| `--max-tokens-per-run <n>`  | Text cap per run sent to the lesson step, chars/4 (default 6000)                    |
| `--max-file-bytes <n>`      | Size cap per memory file (default 16000)                                            |

## Pipeline

Each stage is its own module. Stages 1–3 and the first merge pass are pure, so they can move into Dream Mode later.

1. `normalize.ts`: two passes over the corpus.
   - `parseTrajectory` sniffs the format and reads every turn: user text, assistant text, reasoning, tool calls and tool results. Formats: ATIF (`message`, `reasoning_content`, `tool_calls`, `observation.results`), Claude Code (`text` / `thinking` / `tool_use` / `tool_result` parts, plus flat `user_message` records for curated feedback), Codex (`message`, `reasoning`, `function_call`, `custom_tool_call`, `local_shell_call` and their outputs; `event_msg` duplicates are skipped), OpenCode (`text`, `reasoning`, `tool` parts with their state), ACP (JSON-RPC `session/update` chunks, or the same updates as flat `{type, text}` records), else a generic walk for `{role, content}` nodes. Tool results are unwrapped from `{output}` envelopes and Codex exec wrappers. A result is an error when the harness flags it (`is_error`, `status: failed`, non-zero exit code) or its text looks like one (traceback, `Error:`).
   - Per user message, harness blocks (`<environment_context>`, `<system-reminder>`, `<skills_instructions>`, AGENTS.md, and similar) are removed. When a task marker is present (`Task Description:` as Terminus writes it, or a heading such as `## Task` / `## Request` after a policy preamble), only the section after it is kept.
   - `normalizeRuns` then learns corpus boilerplate (`findBoilerplate`). A paragraph is boilerplate when it is in the user messages of at least 5 runs, and those runs hold at least 3 different rarer texts next to it. That covers a preamble in front of many tasks, and a shared first message whose real task comes in a later user message (for example an "ask the maintainer" intro). A real task repeated in many runs has the same text around it every time, so it stays. Trailing user messages (after the last assistant turn, such as post-run feedback) do not count as context.
   - The task prompt is the first user message with real text left. Later user messages are feedback (the verifier message is excluded). Output is a `NormalizedRun`: task prompt, feedback, trajectory steps (`assistant:`, `thinking:`, `call:`, `result:`, `error:`), the verifier outcome, the earliest timestamp as an order hint, keyword mention counts, and an approximate token count.
   - Budget (`--max-tokens-per-run`, chars/4): prompt up to 30% (both ends kept), newest feedback up to 25%, the trajectory gets the rest. Steps are capped per kind; if they still do not fit, tighter caps apply, and then the first steps and the newest ones are kept with `… N steps omitted …` between them. Errors keep their tail.
2. `group.ts`: matches each run to `tasks.json` by `keywords`. A keyword in the task prompt wins (most hits). Otherwise a keyword that the whole raw run mentions at least 20 times matches: the run is set in that task's world. A passing mention (a pinned dependency, a directory listing: 1 or 2 hits) does not match, and generic words shared with a task description never match alone. A task can also declare `cooccur: { term, with, min }` for a name that its runs say only a few times: the run matches when `term` appears at least `min` (>= 2) times and `with` appears too. This is the weakest rule, after prompt and body matches. It also clusters prompts by 3-word shingle Jaccard. A run's own match wins; otherwise it takes its cluster's majority match; otherwise its cluster becomes a `cluster-*` group.
3. `episodes.ts`: one episodic record per run in `<work>/episodes.jsonl`. Secrets are redacted before the text leaves the machine.
4. `lessons.ts`: one LLM call per run. The reply is strict JSON lessons (`lesson`, `kind`, `outcome_link`, `scope`, `evidence`, `supersedes`). The prompt tells the model to learn from FAIL as well as PASS and to leave out run-specific ids. Results are cached per run hash, model and prompt version.
5. `merge.ts`: per group. The deterministic pass dedupes lessons, weights them by outcome (PASS lessons and FAIL pitfalls up), drops one-run task-specific or run-specific lessons (not preferences), and applies newest-wins supersession to preferences. The optional LLM pass rewrites survivors as imperative instructions and 0–3 skills. Any failure keeps the deterministic result.
6. `export.ts`: writes `MEMORY.md` (one line per topic and skill), `topics/<group>.md` and `skills/<name>/SKILL.md`. Every skill description starts with "Use when". Secrets are redacted and each file is capped. Topic and skill files are cut at the cap with a note. `MEMORY.md` never stops the export: it lists known-task groups first, then groups with more runs, then more PASS runs. It keeps the topic lines that fit, then the skill lines, and ends each cut list with "N more topics in topics/ (not listed)".

`llm.ts` holds the injectable client, the budget, the per-call log (`<work>/llm-calls.jsonl`) and the file cache. `pipeline.ts` runs the stages in order.

## Model, cost and budget

- Calls go through `generateGatewayText` in `engine/llm/aiGateway.ts`. That adds the flex service tier (`FLEX_GATEWAY_PROVIDER_OPTIONS`). Calls also pass `THINKING_OFF`.
- `AI_GATEWAY_API_KEY` is read when a call is made, not at start-up.
- Cost per call is the Gateway-reported cost (`providerMetadata.gateway.cost`, else `marketCost`). If the Gateway gives no cost, the call is priced from token counts with `--price-in` / `--price-out`; `estimatedCostCalls` in the summary counts those calls.
- Before each call the CLI adds an estimate (prompt chars/4, plus 800 output tokens for a lesson call or 1500 for a merge call) to the running cost and the calls in flight. If that passes `--budget-usd`, the call is not sent. Runs without lessons still export; `llm.budgetHit` is then `true`. A call that costs more than its estimate can still take the total past the cap by that difference.
- Cached calls are free. A rerun retries only runs that got no lessons.

## Limits

- `tasks.json` has 3 of the 15 public tasks: the ones the Letta post names (`build-word2vec-pipeline`, `cattrs-compositional-changelog`, `apex-eurogrid-curtailment`). Titles and descriptions are paraphrased from the post, with generic domain terms added. Only the word2vec source (BigCodeBench) is stated; the other two say `unspecified`. Every task needs `keywords`: distinctive terms only, because a keyword in the prompt is enough to match. Add the other 12 when the task list is public. Runs for those tasks still form `cluster-*` groups.
- On the joint-674 corpus (dry run, 22 October 2026): `build-word2vec-pipeline` gets 14 runs, all with word2vec in the prompt (9 direct, 5 BigCodeBench function tasks behind a Terminus preamble). `apex-eurogrid-curtailment` gets 12 runs, 3 by prompt and 9 by body mentions (85 to 341 each). These are 4 different questions set in the same EuroGrid world. No prompt in the corpus asks about curtailment, so the group is world-level, not one exact task. `cattrs-compositional-changelog` gets 0 runs: the 3 files that name cattrs do so once or twice in passing, and no user message names it. Two of them also say changelog, but their cattrs hits are a pinned dependency in another library and a listing of task names. So `tasks.json` does not set `cooccur` for cattrs: `cattrs` x2 + `changelog` would pull in 4 runs (2 direct, 2 by cluster), all from other tasks. Changelog preferences from other repositories land in their own groups.
- Some runs hold no task text in any user message: the prompt says to read an instruction file, or to fetch the user's message through a tool. Those runs still cluster by their shared intro.
- The default prices are assumptions. Check the Gateway price for the model before you trust `--dry-run` estimates.
- The trajectory formats are parsed best-effort from public descriptions of each format. Check `formats` in the dry-run summary against the real inputs: many `generic` runs mean a format was not recognised.
- Parsing is about 2 s for a 4 MB file, because every JSON node is checked with zod.

## Tests

`pnpm --filter @vmem/backend exec vitest run tests/frontiermemory`. The fixtures in `tests/frontiermemory/fixtures` are small synthetic runs: one per format, plus a flat ACP log and a Terminus-style ATIF run with a task marker. Corpus-boilerplate cases are built inline in `normalize.test.ts`. Tests use a fake LLM client and make no network calls.
