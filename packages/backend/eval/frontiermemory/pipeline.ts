import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { toEpisode, writeEpisodes, type Episode } from "./episodes.ts";
import { buildMemoryFiles, writeMemoryFolder } from "./export.ts";
import { groupRuns, mentionTerms } from "./group.ts";
import { estimateLessonCall, extractLessons } from "./lessons.ts";
import {
  createBudget,
  estimateCostUsd,
  mapWithConcurrency,
  type LlmClient,
  type LlmUsage,
  type Prices,
} from "./llm.ts";
import {
  MERGE_CALL_ESTIMATE,
  mergeDeterministic,
  mergeWithLlm,
} from "./merge.ts";
import { normalizeRuns, parseTrajectory } from "./normalize.ts";
import { parseJsonString } from "../../engine/llm/extractJsonString.ts";
import {
  taskSpecSchema,
  type MergedGroup,
  type NormalizedRun,
  type RunLessons,
  type TaskSpec,
} from "./types.ts";

export const DEFAULT_TASKS_PATH = fileURLToPath(
  new URL("./tasks.json", import.meta.url),
);

const tasksFileSchema = z.array(taskSpecSchema);

export interface PipelineOptions {
  inputDir: string;
  outDir: string;
  workDir: string;
  tasksPath: string;
  /** Keep only groups matched to these public task ids. */
  taskIds: string[] | null;
  maxRuns: number | null;
  budgetUsd: number;
  dryRun: boolean;
  llmMerge: boolean;
  model: string;
  prices: Prices;
  concurrency: number;
  maxTokensPerRun: number;
  maxFileBytes: number;
}

interface GroupStats {
  id: string;
  taskId: string | null;
  label: string;
  runs: number;
  pass: number;
  fail: number;
  unknown: number;
  approxTokens: number;
}

interface PipelineSummary {
  dryRun: boolean;
  model: string;
  runs: number;
  formats: Record<string, number>;
  groups: GroupStats[];
  estimate: {
    lessonCalls: number;
    mergeCalls: number;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    prices: Prices;
  };
  llm: (LlmUsage & { budgetUsd: number; budgetHit: boolean }) | null;
  output: { dir: string; files: string[] } | null;
  merged: {
    groupId: string;
    source: MergedGroup["source"];
    instructions: number;
    skills: number;
  }[];
}

function loadTasks(tasksPath: string): TaskSpec[] {
  const tasks = parseJsonString(
    readFileSync(tasksPath, "utf8"),
    tasksFileSchema,
  );
  if (tasks === null) throw new Error(`${tasksPath} is not a valid task list`);
  return tasks;
}

function listInputs(inputDir: string, maxRuns: number | null): string[] {
  const files = readdirSync(inputDir)
    .filter((name) => /\.jsonl?$/i.test(name))
    .sort();
  return maxRuns === null ? files : files.slice(0, maxRuns);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** normalise → group → episodes → lessons → merge → export. */
export async function runPipeline(
  options: PipelineOptions,
  client: LlmClient,
): Promise<PipelineSummary> {
  const tasks = loadTasks(options.tasksPath);
  const knownIds = new Set(tasks.map((task) => task.id));
  const unknownIds = (options.taskIds ?? []).filter((id) => !knownIds.has(id));
  if (unknownIds.length > 0) {
    throw new Error(
      `Unknown task id(s): ${unknownIds.join(", ")}. Known: ${[...knownIds].join(", ")}`,
    );
  }

  const keywords = mentionTerms(tasks);
  // Boilerplate is learnt across the whole corpus, so parse every run first.
  const runs: NormalizedRun[] = normalizeRuns(
    listInputs(options.inputDir, options.maxRuns).map((name) =>
      parseTrajectory(
        name,
        readFileSync(path.join(options.inputDir, name), "utf8"),
        keywords,
      ),
    ),
    options.maxTokensPerRun,
  );
  const runByFile = new Map(runs.map((run) => [run.file, run]));
  const wanted = options.taskIds === null ? null : new Set(options.taskIds);
  const groups = groupRuns(runs, tasks).filter(
    (group) =>
      wanted === null || (group.taskId !== null && wanted.has(group.taskId)),
  );
  const membersOf = (files: readonly string[]) =>
    files.flatMap((file) => {
      const run = runByFile.get(file);
      return run ? [run] : [];
    });

  const groupStats: GroupStats[] = groups.map((group) => {
    const members = membersOf(group.files);
    return {
      id: group.id,
      taskId: group.taskId,
      label: group.label,
      runs: members.length,
      pass: members.filter((run) => run.outcome === "PASS").length,
      fail: members.filter((run) => run.outcome === "FAIL").length,
      unknown: members.filter((run) => run.outcome === "UNKNOWN").length,
      approxTokens: members.reduce((sum, run) => sum + run.approxTokens, 0),
    };
  });
  const formats: Record<string, number> = {};
  for (const run of runs) formats[run.format] = (formats[run.format] ?? 0) + 1;

  const episodes: Episode[] = groups.flatMap((group) =>
    membersOf(group.files).map((run) => toEpisode(run, group.id)),
  );
  mkdirSync(options.workDir, { recursive: true });
  writeEpisodes(path.join(options.workDir, "episodes.jsonl"), episodes);

  const mergeCalls = options.llmMerge ? groups.length : 0;
  const lessonEstimates = episodes.map((episode) =>
    estimateLessonCall(episode),
  );
  const promptTokens =
    lessonEstimates.reduce((sum, e) => sum + e.promptTokens, 0) +
    mergeCalls * MERGE_CALL_ESTIMATE.promptTokens;
  const completionTokens =
    lessonEstimates.reduce((sum, e) => sum + e.completionTokens, 0) +
    mergeCalls * MERGE_CALL_ESTIMATE.completionTokens;
  const summary: PipelineSummary = {
    dryRun: options.dryRun,
    model: options.model,
    runs: runs.length,
    formats,
    groups: groupStats,
    estimate: {
      lessonCalls: episodes.length,
      mergeCalls,
      promptTokens,
      completionTokens,
      costUsd: round(
        estimateCostUsd(promptTokens, completionTokens, options.prices),
        4,
      ),
      prices: options.prices,
    },
    llm: null,
    output: null,
    merged: [],
  };
  if (options.dryRun) return summary;

  const budget = createBudget(options.budgetUsd, options.prices);
  const cacheDir = path.join(options.workDir, "cache");
  // Spend is recorded even when a later stage throws.
  try {
    const extracted = await extractLessons(episodes, {
      model: options.model,
      cacheDir,
      concurrency: options.concurrency,
      budget,
      client,
    });
    const lessonsByFile = new Map(
      episodes.map((episode, i) => [episode.source, extracted[i] ?? []]),
    );

    const merged = await mapWithConcurrency(
      groups,
      options.concurrency,
      async (group) => {
        const runLessons: RunLessons[] = membersOf(group.files).map((run) => ({
          file: run.file,
          outcome: run.outcome,
          orderHint: run.orderHint,
          lessons: lessonsByFile.get(run.file) ?? [],
        }));
        const deterministic = mergeDeterministic(group, runLessons);
        if (!options.llmMerge) return deterministic.merged;
        // tasks.json is for matching only: no title or description is sent.
        return mergeWithLlm(group, deterministic, {
          client,
          budget,
          model: options.model,
          cacheDir,
        });
      },
    );
    summary.merged = merged.map((group) => ({
      groupId: group.groupId,
      source: group.source,
      instructions: group.instructions.length,
      skills: group.skills.length,
    }));

    const files = buildMemoryFiles(merged, options.maxFileBytes);
    writeMemoryFolder(options.outDir, files);
    summary.output = {
      dir: options.outDir,
      files: files.map((file) => file.path),
    };
  } finally {
    writeFileSync(
      path.join(options.workDir, "llm-calls.jsonl"),
      budget.records.map((record) => `${JSON.stringify(record)}\n`).join(""),
    );
    summary.llm = {
      ...budget.usage,
      costUsd: round(budget.usage.costUsd, 6),
      budgetUsd: options.budgetUsd,
      budgetHit: budget.usage.skippedCalls > 0,
    };
    writeFileSync(
      path.join(options.workDir, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    );
  }
  return summary;
}
