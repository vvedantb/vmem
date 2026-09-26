import { fileURLToPath } from "node:url";
import {
  aggregate,
  runCorpusAblation,
  type AggMetrics,
  type ConfigRun,
} from "../benchmark";
import { embeddingMode } from "../embeddings";
import type { EvalJudge } from "../retrieve";
import { loadLocomo10, type LoadLocomo10Options } from "./load";
import {
  convertLocomoDataset,
  sampleToCorpus,
  sliceLocomoSamples,
} from "./convert";
import type { LocomoIrSample, LocomoSkippedQuery } from "./types";

export const DEFAULT_LOCOMO_IR_LIMIT = 8;
export const DEFAULT_LOCOMO_IR_JUDGE: EvalJudge = "off";
export const EVAL_LOCOMO_IR_ENV = "EVAL_LOCOMO_IR";
export const LOCOMO_IR_JUDGE_ENV = "LOCOMO_IR_JUDGE";

export function evalLocomoIrEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[EVAL_LOCOMO_IR_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function locomoIrWantsAblation(
  argv: readonly string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.LOCOMO_IR_ABLATION?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return argv.includes("--ablation");
}

export function parseLocomoIrLimit(
  argv: readonly string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
): number | undefined {
  const envRaw = env.LOCOMO_IR_LIMIT?.trim();
  if (envRaw !== undefined && envRaw.length > 0) {
    if (envRaw.toLowerCase() === "all") return undefined;
    const parsed = Number.parseInt(envRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(`LOCOMO_IR_LIMIT must be a positive integer or "all"`);
    }
    return parsed;
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") return undefined;
    if (arg === "-l" || arg === "--limit") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new Error(`${arg} requires a positive integer`);
      }
      if (next.toLowerCase() === "all") return undefined;
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`${arg} requires a positive integer`);
      }
      return parsed;
    }
    if (arg?.startsWith("--limit=")) {
      const value = arg.slice("--limit=".length);
      if (value.toLowerCase() === "all") return undefined;
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`--limit requires a positive integer`);
      }
      return parsed;
    }
  }
  return DEFAULT_LOCOMO_IR_LIMIT;
}

function parseLocomoIrJudgeValue(raw: string, source: string): EvalJudge {
  const value = raw.trim().toLowerCase();
  if (value === "off" || value === "jev") return value;
  throw new Error(`${source} must be "off" or "jev"`);
}

/** Default `off`. `jev` reranks retrieve candidates like prod (`judge: "jev"`). */
export function parseLocomoIrJudge(
  argv: readonly string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
): EvalJudge {
  const envRaw = env[LOCOMO_IR_JUDGE_ENV]?.trim();
  if (envRaw !== undefined && envRaw.length > 0) {
    return parseLocomoIrJudgeValue(envRaw, LOCOMO_IR_JUDGE_ENV);
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--judge") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new Error(`${arg} requires "off" or "jev"`);
      }
      return parseLocomoIrJudgeValue(next, arg);
    }
    if (arg?.startsWith("--judge=")) {
      return parseLocomoIrJudgeValue(arg.slice("--judge=".length), "--judge");
    }
  }
  return DEFAULT_LOCOMO_IR_JUDGE;
}

export interface RunLocomoIrOptions extends LoadLocomo10Options {
  limit?: number;
  ablation?: boolean;
  judge?: EvalJudge;
  items?: Parameters<typeof convertLocomoDataset>[0];
}

export interface LocomoIrRunResult {
  samples: LocomoIrSample[];
  skipped: LocomoSkippedQuery[];
  runs: ConfigRun[];
  report: string;
  metrics: AggMetrics;
  answerable: number;
  memoryCount: number;
}

function mergeRuns(perSample: ConfigRun[][]): ConfigRun[] {
  const byName = new Map<string, ConfigRun>();
  for (const runs of perSample) {
    for (const run of runs) {
      const existing = byName.get(run.name);
      if (existing === undefined) {
        byName.set(run.name, {
          name: run.name,
          outcomes: [...run.outcomes],
          abstentionTopScores: [...run.abstentionTopScores],
          abstentionEmpty: run.abstentionEmpty,
        });
        continue;
      }
      existing.outcomes.push(...run.outcomes);
      existing.abstentionTopScores.push(...run.abstentionTopScores);
      existing.abstentionEmpty += run.abstentionEmpty;
    }
  }
  return [...byName.values()];
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function mdTable(header: string[], rows: string[][]): string {
  return [header, header.map(() => "---"), ...rows]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

export function buildLocomoIrReport(args: {
  runs: ConfigRun[];
  samples: readonly LocomoIrSample[];
  skipped: readonly LocomoSkippedQuery[];
  memoryCount: number;
  answerable: number;
  judge?: EvalJudge;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const sampleIds = args.samples.map((sample) => sample.sampleId).join(", ");
  const overall = args.runs.map((run) => ({
    name: run.name,
    agg: aggregate(run.outcomes),
  }));
  const overallTable = mdTable(
    [
      "Config",
      "recall@1",
      "recall@3",
      "recall@5",
      "recall@10",
      "P@5",
      "MRR",
      "nDCG@10",
      "p50 ms",
      "p95 ms",
    ],
    overall.map(({ name, agg }) => [
      name,
      pct(agg.recall1),
      pct(agg.recall3),
      pct(agg.recall5),
      pct(agg.recall10),
      pct(agg.precision5),
      agg.mrr.toFixed(3),
      agg.ndcg10.toFixed(3),
      agg.latencyP50.toFixed(0),
      agg.latencyP95.toFixed(0),
    ]),
  );
  const queries = args.samples.flatMap((sample) => sample.queries);
  const types = [...new Set(queries.map((query) => query.type))].sort();
  const typeTable =
    args.runs.length === 0
      ? ""
      : mdTable(
          ["type", "n", ...args.runs.map((run) => `${run.name} nDCG@10`)],
          types.map((type) => {
            const n = queries.filter((query) => query.type === type).length;
            const cells = args.runs.map((run) =>
              aggregate(
                run.outcomes.filter((outcome) => outcome.type === type),
              ).ndcg10.toFixed(3),
            );
            return [type, String(n), ...cells];
          }),
        );
  const skippedLines =
    args.skipped.length === 0
      ? "None."
      : args.skipped
          .slice(0, 20)
          .map(
            (row) =>
              `- ${row.reason} · ${row.sampleId} · ${row.question} · evidence=${JSON.stringify(row.evidence)}`,
          )
          .join("\n");
  const synthesis = queries.filter((query) => query.needsSynthesis).length;
  const world = queries.filter((query) => query.needsWorldKnowledge).length;
  const adversarial = queries.filter((query) => query.adversarial).length;

  const judge = args.judge ?? DEFAULT_LOCOMO_IR_JUDGE;
  const jevNote =
    judge === "jev"
      ? " Optional Jev (`LOCOMO_IR_JUDGE=jev`) reranks the hybrid head before IR metrics (same as prod retrieve, via AI Gateway `typesafe-ai/jev`). Missing `AI_GATEWAY_API_KEY` or a Jev error fail-opens to hybrid. Gold `dia_id` scoring stays deterministic (no MemScore / LLM answer judge)."
      : " Retrieve judge is off (`LOCOMO_IR_JUDGE=off`, default). No OpenAI, Mem0, SuperMemory, or answer-judge calls.";

  return `# vmem LoCoMo-IR (labelled retrieval)

Generated: ${today} · Samples: ${sampleIds} · Utterance memories: ${String(args.memoryCount)} · IR queries: ${String(args.answerable)} · Skipped (no gold hit set): ${String(args.skipped.length)} · Embeddings: ${embeddingMode()} · retrieve judge: \`${judge}\`

This is **labelled retrieval** (recall@k / MRR / nDCG@10) on gold \`dia_id\` evidence. It is **not** MemoryBench MemScore / answer accuracy.${jevNote}

Scored IR gold includes multi-hop (${String(synthesis)}), world-knowledge (${String(world)}), and adversarial (${String(adversarial)}) when evidence IDs resolve. Those still need synthesis or an LLM to *answer*; only span retrieval is scored.

## Retrieval quality

${overallTable}

## nDCG@10 by question type

${typeTable}

## Skipped questions (no deterministic gold hit set)

${skippedLines}

## Notes

- One episodic memory per dialog turn. Gold titles are \`{sample_id}/{dia_id}\`.
- Default smoke: \`-l\` / \`LOCOMO_IR_LIMIT\` (default 8) on the first conversation haystack. Full 1986-Q: \`LOCOMO_IR_LIMIT=all\`.
- Retrieve judge: \`LOCOMO_IR_JUDGE=off|jev\` (default \`off\`). \`jev\` needs \`AI_GATEWAY_API_KEY\` to actually rerank; fail-open matches prod.
- Category IDs follow LoCoMo \`evaluation.py\` (1 multi-hop, 2 temporal, 3 world-knowledge, 4 single-hop, 5 adversarial), not MemoryBench's swapped map.
`;
}

export async function runLocomoIr(
  options: RunLocomoIrOptions = {},
): Promise<LocomoIrRunResult> {
  const items = options.items ?? (await loadLocomo10(options));
  const converted = convertLocomoDataset(items);
  const samples = sliceLocomoSamples(converted.samples, options.limit);
  if (samples.length === 0) {
    throw new Error("LoCoMo-IR: no samples after applying limit");
  }
  const judge = options.judge ?? parseLocomoIrJudge();
  const configs = options.ablation
    ? undefined
    : [{ name: "full hybrid" as const, legs: {}, judge }];
  const perSample: ConfigRun[][] = [];
  let memoryCount = 0;
  for (const sample of samples) {
    memoryCount += sample.memories.length;
    const { runs } = await runCorpusAblation(sampleToCorpus(sample), {
      configs,
      nowMs: sample.nowMs,
      judge,
    });
    perSample.push(runs);
  }
  const runs = mergeRuns(perSample);
  const answerable = samples.reduce(
    (sum, sample) => sum + sample.queries.length,
    0,
  );
  const skipped = converted.skipped.filter((row) =>
    samples.some((sample) => sample.sampleId === row.sampleId),
  );
  const report = buildLocomoIrReport({
    runs,
    samples,
    skipped,
    memoryCount,
    answerable,
    judge,
  });
  const hybrid = runs.find((run) => run.name === "full hybrid") ?? runs[0];
  const metrics = aggregate(hybrid?.outcomes ?? []);
  return {
    samples,
    skipped,
    runs,
    report,
    metrics,
    answerable,
    memoryCount,
  };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  const limit = parseLocomoIrLimit();
  runLocomoIr({
    limit,
    ablation: locomoIrWantsAblation(),
    judge: parseLocomoIrJudge(),
  })
    .then((result) => {
      console.log(result.report);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
