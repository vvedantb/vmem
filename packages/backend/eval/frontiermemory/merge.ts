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
  plainTitle,
  shortHash,
  slugify,
  tokenize,
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
const MAX_SKILL_STEPS = 10;
const EXPECTED_MERGE_OUTPUT_TOKENS = 1500;
const MERGE_PROMPT_VERSION = 2;

// uuids, long hex, temp paths, ISO times, long numbers: true for one run only.
const RUN_SPECIFIC_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{10,}\b|\/tmp\/|\/var\/folders\/|\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}|\b\d{6,}\b/i;
// Sizes, counts and precise values a skill step must not carry from one run.
const RUN_NUMBER_PATTERN =
  /\b\d+\.\d{3,}\b|\b\d[\d,.]*\s*(?:bytes?|[kmgt]i?b|rows?|lines?|records?|entries|items?|samples?|tokens?|files?|seconds?|ms|%)(?![a-z])/i;
// A step that opens with an article or pronoun is a statement, not a command.
const NOT_IMPERATIVE =
  /^(?:the|this|that|these|those|it|its|there|i|we|you|they|my|our|a|an|is|are|was|were)\b/i;

interface Candidate {
  lesson: Lesson;
  file: string;
  outcome: RunLessons["outcome"];
  order: number | null;
  /** Index of the lesson in its run's list: the step order the run used. */
  position: number;
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
    run.lessons.map((lesson, position) => ({
      lesson,
      file: run.file,
      outcome: run.outcome,
      order: run.orderHint,
      position,
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

/**
 * A kept cluster. `order` lets the LLM pass resolve preference conflicts.
 * `passBacked`: a PASS run gave it without linking it to a failure.
 */
interface Survivor extends MergedInstruction {
  order: number | null;
  passBacked: boolean;
  /** Earliest step position of any member, to order skill steps. */
  position: number;
}

function toSurvivor(cluster: Cluster): Survivor {
  return {
    text: cluster.text,
    kind: cluster.kind,
    support: cluster.files.size,
    order: cluster.order,
    passBacked: cluster.members.some(
      (member) =>
        member.outcome === "PASS" &&
        member.lesson.outcome_link !== "led_to_fail",
    ),
    position: Math.min(...cluster.members.map((member) => member.position)),
  };
}

/** One imperative step that holds for any future run, else null. */
function skillStep(text: string): string | null {
  const step = text
    .replace(/^\s*(?:step\s*\d+\s*[:.)-]?|\d+[.)])\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (
    step.length === 0 ||
    NOT_IMPERATIVE.test(step) ||
    RUN_SPECIFIC_PATTERN.test(step) ||
    RUN_NUMBER_PATTERN.test(step)
  ) {
    return null;
  }
  return step;
}

function skillSteps(texts: readonly string[]): string[] {
  const steps: string[] = [];
  for (const text of texts) {
    const step = skillStep(text);
    if (step === null) continue;
    const key = lessonKey(step);
    if (
      steps.some((kept) => jaccard(lessonKey(kept), key) >= DUPLICATE_THRESHOLD)
    ) {
      continue;
    }
    steps.push(step);
  }
  return steps.slice(0, MAX_SKILL_STEPS);
}

const TRIGGER_PATTERN = /^use when a task (names|asks to)\s+(.+)$/i;
/** Near-miss openers the model writes, and the trigger verb they mean. */
const TRIGGER_REPAIRS: readonly [RegExp, "names" | "asks to"][] = [
  [
    /^use when (?:a |the )?(?:task|user|prompt|request)s?\s+(?:names?|mentions?|references?|is about|involves)\s+/i,
    "names",
  ],
  [
    /^use when (?:a |the )?(?:task|user|prompt|request)s?\s+(?:asks?|wants?|needs?|requires?|tells?)\s+(?:you\s+)?to\s+/i,
    "asks to",
  ],
  [
    /^use when (?:you\s+)?(?:need|want|are asked|have|must|are required)\s+to\s+/i,
    "asks to",
  ],
  [/^use when (?:asked|needing|required)\s+to\s+/i, "asks to"],
];
// Triggers that name no concrete task, product, file, tool or action.
const VAGUE_TRIGGER =
  /^(?:work(?:ing)?\s+on|deal(?:ing)?\s+with|help(?:ing)?\s+with|handl(?:e|ing)|do(?:ing)?|perform(?:ing)?|this|these|that|it|similar|related|any|something|(?:a|the|this)\s+(?:same\s+|similar\s+|current\s+|given\s+)?task)\b/i;

/**
 * A direct trigger ("Use when a task names X" / "Use when a task asks to
 * X"), repaired from a near miss. Null when vague or another shape.
 */
export function triggerDescription(description: string): string | null {
  const text = description
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "");
  let verb: "names" | "asks to" | null = null;
  let rest = "";
  const direct = TRIGGER_PATTERN.exec(text);
  if (direct) {
    verb = direct[1]?.toLowerCase() === "names" ? "names" : "asks to";
    rest = direct[2] ?? "";
  } else {
    for (const [pattern, repaired] of TRIGGER_REPAIRS) {
      if (!pattern.test(text)) continue;
      verb = repaired;
      rest = text.replace(pattern, "");
      break;
    }
  }
  if (
    verb === null ||
    VAGUE_TRIGGER.test(rest) ||
    tokenize(rest).length === 0
  ) {
    return null;
  }
  return `Use when a task ${verb} ${rest}`;
}

function fallbackDescription(title: string): string {
  return `Use when a task names ${title.replace(/[.…]+$/, "")}.`;
}

/** Deterministic skill from the PASS-backed procedure steps. */
function fallbackSkill(
  title: string,
  steps: readonly string[],
): SkillDefinition {
  return {
    name: `${slugify(title, 40)}-workflow`,
    description: fallbackDescription(title),
    steps: [...steps],
  };
}

interface DeterministicMerge {
  merged: MergedGroup;
  /** Surviving clusters, strongest first. Input to the LLM pass. */
  survivors: Survivor[];
  /** Generalisable steps from PASS-backed procedures, for the fallback skill. */
  skillSteps: string[];
  /** At least one PASS run and enough steps: a skill must be written. */
  skillRequired: boolean;
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
  const pass = runs.filter((run) => run.outcome === "PASS").length;
  const steps = skillSteps(
    survivors
      .filter((item) => item.kind === "procedure" && item.passBacked)
      .sort((a, b) => a.position - b.position)
      .map((item) => item.text),
  );
  const skillRequired = pass >= 1 && steps.length >= MIN_SKILL_STEPS;
  return {
    survivors,
    skillSteps: steps,
    skillRequired,
    merged: {
      groupId: group.id,
      taskId: group.taskId,
      label: group.label,
      runs: runs.length,
      pass,
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
      skills: skillRequired ? [fallbackSkill(group.label, steps)] : [],
      source: "deterministic",
    },
  };
}

const MERGE_SYSTEM_PROMPT = `You write the memory a future AI agent reads before it does a task. You get candidate lessons mined from past runs of one topic, ranked strongest first, with how many runs support each, whether a passing run backs it, and the run outcomes.

Rules:
- title: a short plain-words title for the topic, at most 60 characters, that names the task, product, file or tool. No brackets, quotes, JSON, code, or numbers from one run.
- instructions: rewrite the lessons as at most ${MAX_INSTRUCTIONS} concise imperative instructions. Each starts with a verb. Merge overlaps. Keep the exact formats, file names, config keys and commands the lessons name.
- Prefer instructions backed by passing runs and pitfalls backed by failing runs. Drop vague or contradictory items.
- Keep every user preference that is still in force. If two preferences conflict, keep only the newer one (listed first). Never include a superseded preference.
- Do not add run-specific ids, hashes, temp paths or one-off numbers. Do not invent facts that are not in the lessons.
- skills: follow the "Skill rule" line of the input. A skill is a reusable multi-step procedure taken from the PASS-backed procedure lessons. Each skill has:
  - name: kebab-case, names the procedure.
  - description: a direct trigger in one of two forms: "Use when a task names <concrete task, product, file or tool>..." or "Use when a task asks to <concrete action>...". Never a vague trigger such as "Use when working on this task" or "Use when doing similar tasks".
  - steps: ${MIN_SKILL_STEPS} to ${MAX_SKILL_STEPS} imperative steps. Each starts with a verb and holds for any future run: no ids, hashes, paths, sizes, counts or other numbers from one past run.

Reply with only JSON:
{"title": "...", "instructions": [{"text": "...", "kind": "procedure|preference|pitfall|fact"}], "skills": [{"name": "...", "description": "Use when a task names ...", "steps": ["..."]}]}`;

/** Rough tokens for one merge call (full lesson list), for --dry-run. */
export const MERGE_CALL_ESTIMATE = {
  promptTokens:
    approxTokens(MERGE_SYSTEM_PROMPT.length) + MAX_INSTRUCTIONS * 40 + 100,
  completionTokens: EXPECTED_MERGE_OUTPUT_TOKENS,
};

const rawSkillSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().catch(""),
  steps: z.array(z.string()),
});

// Lenient: a bad title or skill is dropped, not the whole reply.
const mergeResponseSchema = z.object({
  title: z.string().nullish().catch(null),
  instructions: z.array(
    z.object({
      text: z.string().trim().min(1),
      kind: lessonSchema.shape.kind.catch("procedure"),
    }),
  ),
  skills: z.array(rawSkillSchema.nullable().catch(null)).catch([]),
});
type MergeResponse = z.infer<typeof mergeResponseSchema>;

function skillRule(deterministic: DeterministicMerge): string {
  const { pass } = deterministic.merged;
  if (pass === 0)
    return 'Skill rule: no run passed. Define no skills ("skills": []).';
  if (deterministic.skillRequired) {
    return `Skill rule: ${pass} runs passed and ${deterministic.skillSteps.length} PASS-backed procedure lessons exist. Define at least 1 and at most ${MAX_SKILLS} skills.`;
  }
  return `Skill rule: define 0 to ${MAX_SKILLS} skills, only for a reusable multi-step procedure that a passing run used.`;
}

/**
 * The user message. It names the topic by task id (clusters by their
 * corpus-derived title) and never holds tasks.json titles or descriptions.
 */
function mergePrompt(deterministic: DeterministicMerge): string {
  const base = deterministic.merged;
  const line = (item: Survivor) =>
    `- [${item.kind}; ${item.support} runs${item.passBacked ? "; PASS-backed" : ""}] ${item.text}`;
  const survivors = deterministic.survivors;
  const preferences = survivors
    .filter((item) => item.kind === "preference")
    .sort((a, b) => (b.order ?? -Infinity) - (a.order ?? -Infinity));
  return [
    `# Topic: ${base.taskId ?? base.label}`,
    `Runs: ${base.runs} (${base.pass} PASS, ${base.fail} FAIL)`,
    skillRule(deterministic),
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
  ].join("\n");
}

/** A model skill with a direct trigger (repaired if vague) and general steps. */
function validSkill(
  skill: z.infer<typeof rawSkillSchema>,
  title: string,
): SkillDefinition | null {
  const steps = skillSteps(skill.steps);
  if (steps.length < MIN_SKILL_STEPS) return null;
  return {
    name: slugify(skill.name, 48),
    description:
      triggerDescription(skill.description) ?? fallbackDescription(title),
    steps,
  };
}

/**
 * Model skills that pass validation. No PASS run means no skills. When a
 * skill is required and none is valid, the deterministic fallback is used.
 */
function finalSkills(
  raw: MergeResponse["skills"],
  title: string,
  deterministic: DeterministicMerge,
): SkillDefinition[] {
  if (deterministic.merged.pass === 0) return [];
  const valid = raw
    .flatMap((item) => {
      const skill = item === null ? null : validSkill(item, title);
      return skill ? [skill] : [];
    })
    .slice(0, MAX_SKILLS);
  if (valid.length > 0 || !deterministic.skillRequired) return valid;
  return [fallbackSkill(title, deterministic.skillSteps)];
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
 * Clusters take the model title when it is plain words; known tasks keep
 * their tasks.json title.
 */
export async function mergeWithLlm(
  group: TaskGroup,
  deterministic: DeterministicMerge,
  options: LlmMergeOptions,
): Promise<MergedGroup> {
  const base = deterministic.merged;
  if (deterministic.survivors.length === 0) return base;
  const prompt = mergePrompt(deterministic);
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
  const title =
    base.taskId === null
      ? (plainTitle(response.title ?? "") ?? base.label)
      : base.label;
  return {
    ...base,
    label: title,
    instructions,
    skills: finalSkills(response.skills, title, deterministic),
    source: "llm",
  };
}
