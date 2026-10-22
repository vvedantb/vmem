import { z } from "zod";
import { THINKING_OFF } from "../../engine/llm/aiGateway.ts";
import { parseJsonString } from "../../engine/llm/extractJsonString.ts";
import {
  callWithBudget,
  readCache,
  writeCache,
  type Budget,
  type LlmClient,
} from "./llm.ts";
import {
  approxTokens,
  jaccard,
  lessonKey,
  shortHash,
  slugify,
} from "./text.ts";
import {
  lessonSchema,
  type Lesson,
  type LessonKind,
  type MergedGroup,
  type MergedInstruction,
  type RunLessons,
  type SkillDefinition,
  type TaskGroup,
} from "./types.ts";

const DUPLICATE_THRESHOLD = 0.6;
/** Same topic, different content: a newer preference replaces the older. */
const PREFERENCE_TOPIC_THRESHOLD = 0.35;
const SUPERSEDES_MATCH_THRESHOLD = 0.5;
const MAX_INSTRUCTIONS = 20;
const MAX_SKILLS = 3;
const MIN_SKILL_STEPS = 3;
const EXPECTED_MERGE_OUTPUT_TOKENS = 1500;
const MERGE_PROMPT_VERSION = 1;

// uuids, long hex, temp paths, ISO times, long numbers: true for one run only.
const RUN_SPECIFIC_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{10,}\b|\/tmp\/|\/var\/folders\/|\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}|\b\d{6,}\b/i;

interface Candidate {
  lesson: Lesson;
  file: string;
  order: number | null;
  weight: number;
}

interface Cluster {
  kind: LessonKind;
  key: Set<string>;
  text: string;
  members: Candidate[];
  files: Set<string>;
  weight: number;
  /** Newest run order of any member; null when no member has one. */
  order: number | null;
  general: boolean;
  supersededBy: string | null;
}

/** PASS-run lessons and FAIL-run pitfalls count most. */
function outcomeWeight(lesson: Lesson, outcome: RunLessons["outcome"]): number {
  if (lesson.kind === "preference") return 1.5;
  if (outcome === "PASS") {
    if (lesson.outcome_link === "led_to_pass") return 2;
    return lesson.kind === "pitfall" ? 1.25 : 1.5;
  }
  if (outcome === "FAIL") {
    // A failed run's "this worked" claim is weak evidence.
    return lesson.kind === "pitfall" || lesson.outcome_link === "led_to_fail"
      ? 2
      : 0.5;
  }
  return 1;
}

function newer(a: number | null, b: number | null): boolean {
  if (a === null) return false;
  return b === null || a > b;
}

function clusterLessons(runs: readonly RunLessons[]): Cluster[] {
  const candidates: Candidate[] = runs.flatMap((run) =>
    run.lessons.map((lesson) => ({
      lesson,
      file: run.file,
      order: run.orderHint,
      weight: outcomeWeight(lesson, run.outcome),
    })),
  );
  // Strongest first; for ties the newest wording represents the cluster.
  candidates.sort(
    (a, b) =>
      b.weight - a.weight ||
      (b.order ?? -Infinity) - (a.order ?? -Infinity) ||
      a.lesson.lesson.localeCompare(b.lesson.lesson),
  );
  const clusters: Cluster[] = [];
  for (const candidate of candidates) {
    const key = lessonKey(candidate.lesson.lesson);
    const match = clusters.find(
      (cluster) =>
        cluster.kind === candidate.lesson.kind &&
        jaccard(cluster.key, key) >= DUPLICATE_THRESHOLD,
    );
    if (match) {
      match.members.push(candidate);
      match.files.add(candidate.file);
      match.weight += candidate.weight;
      if (newer(candidate.order, match.order)) match.order = candidate.order;
      match.general ||= candidate.lesson.scope === "general";
      continue;
    }
    clusters.push({
      kind: candidate.lesson.kind,
      key,
      text: candidate.lesson.lesson,
      members: [candidate],
      files: new Set([candidate.file]),
      weight: candidate.weight,
      order: candidate.order,
      general: candidate.lesson.scope === "general",
      supersededBy: null,
    });
  }
  return clusters;
}

/** One-run, task-specific or run-specific lessons do not transfer. */
function isWeak(cluster: Cluster, groupRuns: number): boolean {
  if (cluster.kind === "preference" || cluster.files.size >= 2) return false;
  if (RUN_SPECIFIC_PATTERN.test(cluster.text)) return true;
  // A one-run group cannot show support, so it keeps task-specific lessons.
  return groupRuns >= 2 && !cluster.general;
}

/**
 * Newest wins. A preference replaces an older one when it names it in
 * `supersedes`, or when both are on the same topic but are not duplicates.
 */
function applySupersession(clusters: readonly Cluster[]): void {
  const preferences = clusters
    .filter((cluster) => cluster.kind === "preference")
    .sort((a, b) => (b.order ?? -Infinity) - (a.order ?? -Infinity));
  for (const current of preferences) {
    if (current.supersededBy !== null) continue;
    const named = current.members.flatMap((member) =>
      member.lesson.supersedes ? [lessonKey(member.lesson.supersedes)] : [],
    );
    for (const older of preferences) {
      if (older === current || older.supersededBy !== null) continue;
      const strictlyOlder = newer(current.order, older.order);
      const sameOrOlder = strictlyOlder || current.order === older.order;
      const explicit =
        sameOrOlder &&
        named.some(
          (key) => jaccard(key, older.key) >= SUPERSEDES_MATCH_THRESHOLD,
        );
      const topical =
        strictlyOlder &&
        jaccard(current.key, older.key) >= PREFERENCE_TOPIC_THRESHOLD;
      if (explicit || topical) older.supersededBy = current.text;
    }
  }
}

/** A kept cluster. `order` lets the LLM pass resolve preference conflicts. */
interface Survivor extends MergedInstruction {
  order: number | null;
}

function toSurvivor(cluster: Cluster): Survivor {
  return {
    text: cluster.text,
    kind: cluster.kind,
    support: cluster.files.size,
    order: cluster.order,
  };
}

function deterministicSkills(
  group: TaskGroup,
  procedures: readonly Cluster[],
): SkillDefinition[] {
  const steps = procedures
    .filter((cluster) => cluster.members.some((member) => member.weight >= 1.5))
    .map((cluster) => cluster.text);
  if (steps.length < MIN_SKILL_STEPS) return [];
  return [
    {
      name: `${slugify(group.id, 40)}-workflow`,
      description: `Use when working on "${group.label}": follow the steps that passing runs used.`,
      steps,
    },
  ];
}

interface DeterministicMerge {
  merged: MergedGroup;
  /** Surviving clusters, strongest first. Input to the LLM pass. */
  survivors: Survivor[];
}

/** Pure first pass: dedupe, outcome weighting, support filter, supersession. */
export function mergeDeterministic(
  group: TaskGroup,
  runs: readonly RunLessons[],
): DeterministicMerge {
  const clusters = clusterLessons(runs);
  applySupersession(clusters);
  const kept = clusters
    .filter(
      (cluster) =>
        cluster.supersededBy === null && !isWeak(cluster, runs.length),
    )
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        b.files.size - a.files.size ||
        a.text.localeCompare(b.text),
    )
    .slice(0, MAX_INSTRUCTIONS);
  const survivors = kept.map((cluster) => toSurvivor(cluster));
  return {
    survivors,
    merged: {
      groupId: group.id,
      taskId: group.taskId,
      label: group.label,
      runs: runs.length,
      pass: runs.filter((run) => run.outcome === "PASS").length,
      fail: runs.filter((run) => run.outcome === "FAIL").length,
      instructions: survivors.map((item) => ({
        text: item.text,
        kind: item.kind,
        support: item.support,
      })),
      superseded: clusters.flatMap((cluster) =>
        cluster.supersededBy === null
          ? []
          : [{ text: cluster.text, supersededBy: cluster.supersededBy }],
      ),
      skills: deterministicSkills(
        group,
        kept.filter((cluster) => cluster.kind === "procedure"),
      ),
      source: "deterministic",
    },
  };
}

const MERGE_SYSTEM_PROMPT = `You write the memory a future AI agent reads before it does a task. You get candidate lessons mined from past runs of that task, ranked strongest first, with how many runs support each and the run outcomes.

Rules:
- Rewrite them as at most ${MAX_INSTRUCTIONS} concise imperative instructions. Each starts with a verb. Merge overlaps. Keep the exact formats, file names, config keys and commands the lessons name.
- Prefer instructions backed by passing runs and pitfalls backed by failing runs. Drop vague or contradictory items.
- Keep every user preference that is still in force. If two preferences conflict, keep only the newer one (listed first). Never include a superseded preference.
- Do not add run-specific ids, hashes, temp paths or one-off numbers. Do not invent facts that are not in the lessons.
- Define 0 to ${MAX_SKILLS} skills, only for reusable multi-step procedures. Each skill: a kebab-case name, a description that starts with "Use when" and names the situation that should trigger it, and 3 to 10 imperative steps.

Reply with only JSON:
{"instructions": [{"text": "...", "kind": "procedure|preference|pitfall|fact"}], "skills": [{"name": "...", "description": "Use when ...", "steps": ["..."]}]}`;

/** Rough tokens for one merge call (full lesson list), for --dry-run. */
export const MERGE_CALL_ESTIMATE = {
  promptTokens:
    approxTokens(MERGE_SYSTEM_PROMPT.length) + MAX_INSTRUCTIONS * 40 + 100,
  completionTokens: EXPECTED_MERGE_OUTPUT_TOKENS,
};

const mergeResponseSchema = z.object({
  instructions: z.array(
    z.object({
      text: z.string().trim().min(1),
      kind: lessonSchema.shape.kind.catch("procedure"),
    }),
  ),
  skills: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        description: z.string().trim().min(1),
        steps: z.array(z.string().trim().min(1)).min(1),
      }),
    )
    .catch([]),
});
type MergeResponse = z.infer<typeof mergeResponseSchema>;

function mergePrompt(
  base: MergedGroup,
  survivors: readonly Survivor[],
  taskDescription: string | null,
): string {
  const line = (item: Survivor) =>
    `- [${item.kind}; ${item.support} runs] ${item.text}`;
  const preferences = survivors
    .filter((item) => item.kind === "preference")
    .sort((a, b) => (b.order ?? -Infinity) - (a.order ?? -Infinity));
  const lines = [
    `# Task: ${base.label}`,
    taskDescription ? `Description: ${taskDescription}` : null,
    `Runs: ${base.runs} (${base.pass} PASS, ${base.fail} FAIL)`,
    "",
    "## Candidate lessons (strongest first)",
    ...survivors.filter((item) => item.kind !== "preference").map(line),
    "",
    "## User preferences (newest first; if two conflict, keep the newer)",
    ...(preferences.length > 0 ? preferences.map(line) : ["(none)"]),
    "",
    "## Superseded preferences (do not include)",
    ...(base.superseded.length > 0
      ? base.superseded.map(
          (item) => `- "${item.text}" replaced by "${item.supersededBy}"`,
        )
      : ["(none)"]),
  ];
  return lines.filter((line) => line !== null).join("\n");
}

interface LlmMergeOptions {
  client: LlmClient;
  budget: Budget;
  model: string;
  cacheDir: string;
}

/**
 * One optional LLM call that generalises the deterministic survivors. Any
 * failure (budget cap, bad JSON, empty reply) keeps the deterministic result.
 */
export async function mergeWithLlm(
  group: TaskGroup,
  deterministic: DeterministicMerge,
  taskDescription: string | null,
  options: LlmMergeOptions,
): Promise<MergedGroup> {
  const base = deterministic.merged;
  if (deterministic.survivors.length === 0) return base;
  const prompt = mergePrompt(base, deterministic.survivors, taskDescription);
  const key = `merge-${shortHash(`${options.model}\n${MERGE_PROMPT_VERSION}\n${prompt}`)}`;
  let response: MergeResponse | null = readCache(
    options.cacheDir,
    key,
    mergeResponseSchema,
  );
  if (response) {
    options.budget.usage.cachedCalls += 1;
  } else {
    const text = await callWithBudget(
      options.budget,
      options.client,
      {
        model: options.model,
        messages: [
          { role: "system", content: MERGE_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        providerOptions: THINKING_OFF,
      },
      EXPECTED_MERGE_OUTPUT_TOKENS,
      `merge:${group.id}`,
    );
    response =
      text === null ? null : parseJsonString(text, mergeResponseSchema);
    if (response === null || response.instructions.length === 0) return base;
    writeCache(options.cacheDir, key, response);
  }
  const supersededKeys = base.superseded.map((item) => lessonKey(item.text));
  const instructions = response.instructions
    .filter(
      (item) =>
        !supersededKeys.some(
          (key) => jaccard(key, lessonKey(item.text)) >= DUPLICATE_THRESHOLD,
        ),
    )
    .slice(0, MAX_INSTRUCTIONS)
    .map((item) => ({ text: item.text, kind: item.kind, support: 0 }));
  return {
    ...base,
    instructions,
    skills: response.skills.slice(0, MAX_SKILLS).map((skill) => ({
      name: slugify(skill.name, 48),
      description: skill.description,
      steps: skill.steps,
    })),
    source: "llm",
  };
}
