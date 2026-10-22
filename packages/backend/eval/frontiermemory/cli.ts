import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MAX_FILE_BYTES } from "./export.ts";
import { DEFAULT_LESSON_MODEL } from "./lessons.ts";
import { DEFAULT_PRICES, gatewayLlmClient } from "./llm.ts";
import { DEFAULT_NORMALIZE_OPTIONS } from "./normalize.ts";
import {
  DEFAULT_TASKS_PATH,
  runPipeline,
  type PipelineOptions,
} from "./pipeline.ts";

const USAGE = `Usage: pnpm --filter @vmem/backend eval:frontiermemory -- --input <dir> --out <dir> [flags]
  --input <dir>            Folder of trajectories (tNNNN.json / .jsonl)
  --out <dir>              Memory folder to write (MEMORY.md, topics/, skills/)
  --work <dir>             Cache and episode store (default <out>.work)
  --tasks <ids>            Comma list of public task ids to keep
  --tasks-file <path>      Task list (default eval/frontiermemory/tasks.json)
  --max-runs <n>           Read at most n input files (sorted by name)
  --budget-usd <n>         Hard cap on LLM spend (default 1)
  --dry-run                No LLM calls: normalise, group, print stats and a cost estimate
  --no-llm-merge           Deterministic merge only (one LLM call per run remains)
  --model <id>             Gateway model (default ${DEFAULT_LESSON_MODEL})
  --price-in <usd>         $/M input tokens for estimates (default ${DEFAULT_PRICES.inputUsdPerM}, assumed)
  --price-out <usd>        $/M output tokens for estimates (default ${DEFAULT_PRICES.outputUsdPerM}, assumed)
  --concurrency <n>        LLM calls in flight (default 8)
  --max-tokens-per-run <n> Trim cap per run (default ${DEFAULT_NORMALIZE_OPTIONS.maxTokens})
  --max-file-bytes <n>     Size cap per memory file (default ${DEFAULT_MAX_FILE_BYTES})
Live runs read AI_GATEWAY_API_KEY from the environment.`;

function positiveNumber(name: string, raw: string, integer: boolean): number {
  const parsed = Number(raw);
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    (integer && (!Number.isInteger(parsed) || parsed < 1))
  ) {
    throw new Error(
      `${name} needs a ${integer ? "positive integer" : "number >= 0"}, got "${raw}"`,
    );
  }
  return parsed;
}

export function parseCliArgs(
  argv: readonly string[],
): PipelineOptions & { help: boolean } {
  let inputDir: string | null = null;
  let outDir: string | null = null;
  let workDir: string | null = null;
  let help = false;
  const options: Omit<PipelineOptions, "inputDir" | "outDir" | "workDir"> = {
    tasksPath: DEFAULT_TASKS_PATH,
    taskIds: null,
    maxRuns: null,
    budgetUsd: 1,
    dryRun: false,
    llmMerge: true,
    model: DEFAULT_LESSON_MODEL,
    prices: { ...DEFAULT_PRICES },
    concurrency: 8,
    maxTokensPerRun: DEFAULT_NORMALIZE_OPTIONS.maxTokens,
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = (): string => {
      i += 1;
      const next = argv[i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    switch (arg) {
      case "--":
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      case "--input":
        inputDir = path.resolve(value());
        break;
      case "--out":
        outDir = path.resolve(value());
        break;
      case "--work":
        workDir = path.resolve(value());
        break;
      case "--tasks":
        options.taskIds = value()
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
        break;
      case "--tasks-file":
        options.tasksPath = path.resolve(value());
        break;
      case "--max-runs":
        options.maxRuns = positiveNumber(arg, value(), true);
        break;
      case "--budget-usd":
        options.budgetUsd = positiveNumber(arg, value(), false);
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--no-llm-merge":
        options.llmMerge = false;
        break;
      case "--model":
        options.model = value();
        break;
      case "--price-in":
        options.prices.inputUsdPerM = positiveNumber(arg, value(), false);
        break;
      case "--price-out":
        options.prices.outputUsdPerM = positiveNumber(arg, value(), false);
        break;
      case "--concurrency":
        options.concurrency = positiveNumber(arg, value(), true);
        break;
      case "--max-tokens-per-run":
        options.maxTokensPerRun = positiveNumber(arg, value(), true);
        break;
      case "--max-file-bytes":
        options.maxFileBytes = positiveNumber(arg, value(), true);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
    }
  }
  if (help) {
    return { ...options, inputDir: "", outDir: "", workDir: "", help };
  }
  if (inputDir === null || outDir === null) {
    throw new Error(`--input and --out are required\n${USAGE}`);
  }
  return {
    ...options,
    inputDir,
    outDir,
    workDir: workDir ?? `${outDir}.work`,
    help,
  };
}

async function main(): Promise<number> {
  const { help, ...options } = parseCliArgs(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return 0;
  }
  const summary = await runPipeline(options, gatewayLlmClient);
  console.log(JSON.stringify(summary, null, 2));
  return 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "frontiermemory failed",
      );
      process.exit(1);
    },
  );
}
