import { head, jaccard, slugify, tokenize } from "./text.ts";
import type { NormalizedRun, TaskGroup, TaskSpec } from "./types.ts";

interface GroupOptions {
  /** Weighted share of a task's tokens that a prompt must contain. */
  minTaskScore: number;
  /** Shingle Jaccard at which two prompts are the same task. */
  clusterThreshold: number;
}

const DEFAULT_GROUP_OPTIONS: GroupOptions = {
  minTaskScore: 0.35,
  clusterThreshold: 0.4,
};

const SHINGLE_WORDS = 3;
const SHINGLE_PROMPT_TOKENS = 400;

interface TaskIndex {
  task: TaskSpec;
  /** id + title tokens: the strongest signal. */
  nameTokens: Set<string>;
  descriptionTokens: Set<string>;
  phrases: string[];
}

/** Share of the score from id/title tokens; the rest from the description. */
const NAME_WEIGHT = 0.6;

/** idf over the task list, so tokens shared by many tasks count less. */
function buildTaskIndex(tasks: readonly TaskSpec[]): {
  entries: TaskIndex[];
  idf: Map<string, number>;
} {
  const entries = tasks.map((task) => ({
    task,
    nameTokens: new Set(tokenize(`${task.id} ${task.title}`)),
    descriptionTokens: new Set(tokenize(task.description)),
    phrases: [task.id, task.title].map((phrase) => phrase.toLowerCase()),
  }));
  const df = new Map<string, number>();
  for (const entry of entries) {
    for (const token of new Set([
      ...entry.nameTokens,
      ...entry.descriptionTokens,
    ])) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [token, count] of df) {
    idf.set(token, Math.log(1 + entries.length / count));
  }
  return { entries, idf };
}

/** Best public task for a prompt, or null under the score threshold. */
export function matchTask(
  prompt: string,
  tasks: readonly TaskSpec[],
  minScore = DEFAULT_GROUP_OPTIONS.minTaskScore,
): { taskId: string; score: number } | null {
  const { entries, idf } = buildTaskIndex(tasks);
  return matchWithIndex(prompt, entries, idf, minScore);
}

function weightedShare(
  tokens: ReadonlySet<string>,
  promptTokens: ReadonlySet<string>,
  idf: ReadonlyMap<string, number>,
): number {
  let hit = 0;
  let total = 0;
  for (const token of tokens) {
    const weight = idf.get(token) ?? 0;
    total += weight;
    if (promptTokens.has(token)) hit += weight;
  }
  return total > 0 ? hit / total : 0;
}

/** 1 for a literal id/title hit, else idf-weighted name and description overlap. */
function taskScore(
  entry: TaskIndex,
  lowerPrompt: string,
  promptTokens: ReadonlySet<string>,
  idf: ReadonlyMap<string, number>,
): number {
  if (entry.phrases.some((phrase) => lowerPrompt.includes(phrase))) return 1;
  return (
    NAME_WEIGHT * weightedShare(entry.nameTokens, promptTokens, idf) +
    (1 - NAME_WEIGHT) *
      weightedShare(entry.descriptionTokens, promptTokens, idf)
  );
}

function matchWithIndex(
  prompt: string,
  entries: readonly TaskIndex[],
  idf: ReadonlyMap<string, number>,
  minScore: number,
): { taskId: string; score: number } | null {
  const lower = prompt.toLowerCase();
  const promptTokens = new Set(tokenize(prompt));
  let best: { taskId: string; score: number } | null = null;
  for (const entry of entries) {
    const score = taskScore(entry, lower, promptTokens, idf);
    if (score >= minScore && (best === null || score > best.score)) {
      best = { taskId: entry.task.id, score };
    }
  }
  return best;
}

function shingles(prompt: string): Set<string> {
  const tokens = tokenize(prompt.replace(/\d+/g, "#")).slice(
    0,
    SHINGLE_PROMPT_TOKENS,
  );
  const out = new Set<string>();
  if (tokens.length < SHINGLE_WORDS) {
    if (tokens.length > 0) out.add(tokens.join(" "));
    return out;
  }
  for (let i = 0; i + SHINGLE_WORDS <= tokens.length; i += 1) {
    out.add(tokens.slice(i, i + SHINGLE_WORDS).join(" "));
  }
  return out;
}

function unionFind(size: number) {
  const parent = Array.from({ length: size }, (_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] ?? root;
    parent[i] = root;
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  return { find, union };
}

function topKeywords(prompts: readonly string[], count: number): string[] {
  const df = new Map<string, number>();
  for (const prompt of prompts) {
    for (const token of new Set(tokenize(prompt.replace(/\d+/g, "")))) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  return [...df.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([token]) => token);
}

function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && best !== null && value < best)
    ) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Groups runs by task. A run's own public-task match wins. Otherwise it takes
 * the majority match of its prompt-similarity cluster. Runs with no match in
 * their cluster become a `cluster-*` group. Largest groups first.
 */
export function groupRuns(
  runs: readonly NormalizedRun[],
  tasks: readonly TaskSpec[],
  options: GroupOptions = DEFAULT_GROUP_OPTIONS,
): TaskGroup[] {
  const { entries, idf } = buildTaskIndex(tasks);
  const matches = runs.map(
    (run) =>
      matchWithIndex(run.taskPrompt, entries, idf, options.minTaskScore)
        ?.taskId ?? null,
  );
  const shingleSets = runs.map((run) => shingles(run.taskPrompt));
  const uf = unionFind(runs.length);
  for (let i = 0; i < runs.length; i += 1) {
    const a = shingleSets[i];
    if (!a || a.size === 0) continue;
    for (let j = i + 1; j < runs.length; j += 1) {
      const b = shingleSets[j];
      if (b && jaccard(a, b) >= options.clusterThreshold) uf.union(i, j);
    }
  }

  const clusterVotes = new Map<number, string[]>();
  runs.forEach((_, i) => {
    const match = matches[i];
    if (match === null || match === undefined) return;
    const root = uf.find(i);
    clusterVotes.set(root, [...(clusterVotes.get(root) ?? []), match]);
  });

  const byKey = new Map<string, { taskId: string | null; indexes: number[] }>();
  runs.forEach((_, i) => {
    const root = uf.find(i);
    const taskId = matches[i] ?? mostCommon(clusterVotes.get(root) ?? []);
    const key = taskId === null ? `cluster:${root}` : `task:${taskId}`;
    const bucket = byKey.get(key) ?? { taskId, indexes: [] };
    bucket.indexes.push(i);
    byKey.set(key, bucket);
  });

  const titles = new Map(tasks.map((task) => [task.id, task.title]));
  const buckets = [...byKey.values()].sort(
    (a, b) =>
      b.indexes.length - a.indexes.length ||
      (a.taskId ?? "~").localeCompare(b.taskId ?? "~") ||
      (a.indexes[0] ?? 0) - (b.indexes[0] ?? 0),
  );
  let clusterNumber = 0;
  return buckets.map((bucket) => {
    const members = bucket.indexes.flatMap((i) => {
      const run = runs[i];
      return run ? [run] : [];
    });
    const files = members.map((run) => run.file);
    if (bucket.taskId !== null) {
      return {
        id: bucket.taskId,
        taskId: bucket.taskId,
        label: titles.get(bucket.taskId) ?? bucket.taskId,
        files,
      };
    }
    clusterNumber += 1;
    const prompts = members.map((run) => run.taskPrompt);
    const keywords = topKeywords(prompts, 3);
    const firstLine = (prompts[0] ?? "")
      .split("\n")
      .find((line) => line.trim());
    return {
      id: `cluster-${clusterNumber}-${slugify(keywords.join(" "), 32)}`,
      taskId: null,
      label: head(firstLine?.trim() ?? keywords.join(" "), 80),
      files,
    };
  });
}
