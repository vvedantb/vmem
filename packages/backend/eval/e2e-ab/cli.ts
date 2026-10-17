import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeOnPath } from "./claude.ts";
import { formatTable, DEFAULT_OUT_PATH } from "./report.ts";
import {
  evalE2eAbDryRun,
  evalE2eAbEnabled,
  parsePositiveInt,
  runE2eAb,
  EVAL_E2E_AB_ENV,
  type RunE2eAbOptions,
} from "./run.ts";

const USAGE = `Usage: pnpm --filter @vmem/backend eval:e2e-ab -- [flags]
  --dry-run                 Load fixtures, write result.json, no claude and no HTTP
  --repeats <n>             Trials per arm per fixture (default 3)
  --fixture <id-or-path>    Run a subset (repeatable)
  --out <path>              result.json path (default ${DEFAULT_OUT_PATH})
  --model <name>            Agent model
  --judge-model <name>      Judge model
  --timeout-seconds <n>     Per claude call (default 180)
Live runs need ${EVAL_E2E_AB_ENV}=1, claude on PATH, VMEM_API_KEY and CONVEX_SITE_URL.`;

export function parseCliArgs(
  argv: readonly string[],
): RunE2eAbOptions & { help: boolean } {
  const options: RunE2eAbOptions & { help: boolean } = { help: false };
  const selectors: string[] = [];
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
        options.help = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--repeats":
        options.repeats = parsePositiveInt("--repeats", value());
        break;
      case "--fixture":
        selectors.push(value());
        break;
      case "--out":
        options.outPath = path.resolve(value());
        break;
      case "--model":
        options.model = value();
        break;
      case "--judge-model":
        options.judgeModel = value();
        break;
      case "--timeout-seconds":
        options.timeoutSeconds = parsePositiveInt("--timeout-seconds", value());
        break;
      default:
        throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
    }
  }
  if (selectors.length > 0) options.fixtureSelectors = selectors;
  return options;
}

async function main(): Promise<number> {
  const { help, ...options } = parseCliArgs(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return 0;
  }
  const dryRun = options.dryRun ?? evalE2eAbDryRun();
  if (!dryRun) {
    if (!evalE2eAbEnabled()) {
      console.error(
        `Refusing to run live. Set ${EVAL_E2E_AB_ENV}=1 to call claude and seed vmem, or use --dry-run.`,
      );
      return 1;
    }
    if (!claudeOnPath()) {
      console.error("The `claude` binary is not on PATH. Nothing was run.");
      return 1;
    }
  }
  const result = await runE2eAb({ ...options, dryRun });
  console.log(formatTable(result));
  console.log(`\nresult.json: ${options.outPath ?? DEFAULT_OUT_PATH}`);
  return 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : "e2e-ab failed");
      process.exit(1);
    },
  );
}
