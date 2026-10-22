import { jaccard } from "./words.ts";

/**
 * Skill dedupe, shared by Dream Mode (drafts against the user's skills) and
 * the frontiermemory eval (across groups). Pure.
 *
 * Two skills are near-identical when their normalised names match closely,
 * or match moderately and their descriptions and steps overlap.
 */

export interface DedupeSkill {
  name: string;
  description: string;
  steps: readonly string[];
}

export interface Skill {
  name: string;
  description: string;
  steps: string[];
}

const MAX_STEPS = 10;
/** Names alone: "configure-git-identity" vs "configure-git-identity-locally". */
const NAME_ONLY_THRESHOLD = 0.75;
/** Names that share most words, when the bodies also agree. */
const NAME_THRESHOLD = 0.5;
const BODY_THRESHOLD = 0.25;
const STEP_DUPLICATE_THRESHOLD = 0.5;
const STEP_CONTAINED_THRESHOLD = 0.8;

const NAME_STOPWORDS = new Set(
  "a an and as at by for from in into of on or the to via with".split(" "),
);
const BODY_STOPWORDS = new Set(
  (
    "the and for are but not you your with this that from have has was were will " +
    "can all any its into than then them they their there these those what when " +
    "which who why how use using used should would could must also just only each " +
    "some such out our about over under after before more most other very make " +
    "made does did done get got file files run runs please task tasks need needs " +
    "want names asks"
  ).split(" "),
);
/** Verbs that name the same act. */
const SYNONYMS: Readonly<Record<string, string>> = {
  setup: "configure",
  set: "configure",
  config: "configure",
};

/** Light stem: "locally" → "local", "builds" → "build". */
function stem(token: string): string {
  if (token.length <= 4) return token;
  return token.replace(/(?:ly|ing|ed|es|s)$/, "");
}

/** Name words: numeric suffixes, "workflow" and connectives removed. */
function nameKey(name: string): Set<string> {
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length > 0 &&
        !/^\d+$/.test(token) &&
        !token.startsWith("workflo") &&
        !NAME_STOPWORDS.has(token),
    )
    .map((token) => SYNONYMS[token] ?? stem(token));
  return new Set(tokens);
}

/** Content words, stemmed, digits masked. */
function textKey(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/\d+/g, "#")
      .split(/[^a-z0-9#]+/)
      .filter((token) => token.length >= 3 && !BODY_STOPWORDS.has(token))
      .map(stem),
  );
}

/** Share of the smaller set held by the larger. */
function containment(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const small = a.size <= b.size ? a : b;
  const large = small === a ? b : a;
  if (small.size === 0) return 0;
  let shared = 0;
  for (const item of small) if (large.has(item)) shared += 1;
  return shared / small.size;
}

interface Keyed {
  skill: DedupeSkill;
  name: Set<string>;
  body: Set<string>;
}

function keyed(skill: DedupeSkill): Keyed {
  return {
    skill,
    name: nameKey(skill.name),
    body: textKey([skill.description, ...skill.steps].join(" ")),
  };
}

export function isNearDuplicateSkill(a: DedupeSkill, b: DedupeSkill): boolean {
  return similar(keyed(a), keyed(b));
}

function similar(a: Keyed, b: Keyed): boolean {
  const name = jaccard(a.name, b.name);
  if (name >= NAME_ONLY_THRESHOLD) return true;
  return name >= NAME_THRESHOLD && jaccard(a.body, b.body) >= BODY_THRESHOLD;
}

export function isNearDuplicateStep(a: string, b: string): boolean {
  const left = textKey(a);
  const right = textKey(b);
  return (
    jaccard(left, right) >= STEP_DUPLICATE_THRESHOLD ||
    (Math.min(left.size, right.size) >= 3 &&
      containment(left, right) >= STEP_CONTAINED_THRESHOLD)
  );
}

function withoutNumericSuffix(name: string): string {
  return name.replace(/(?:-\d+)+$/, "");
}

/**
 * The cluster's name: the most frequent one, then the one closest to all
 * others (medoid), then the shorter, then A–Z. A numeric suffix ("-2") is
 * removed.
 */
function bestName(members: readonly Keyed[]): string {
  const names = members.map((member) =>
    withoutNumericSuffix(member.skill.name),
  );
  const scored = members.map((member, i) => ({
    name: names[i] ?? "",
    count: names.filter((name) => name === names[i]).length,
    score: members.reduce(
      (sum, other) => sum + jaccard(member.name, other.name),
      0,
    ),
  }));
  scored.sort(
    (a, b) =>
      b.count - a.count ||
      b.score - a.score ||
      a.name.length - b.name.length ||
      a.name.localeCompare(b.name),
  );
  return scored[0]?.name ?? "";
}

/** The member with the longest "Use when" description, else the longest. */
function bestDescribed(members: readonly Keyed[]): Keyed | undefined {
  const useWhen = members.filter((member) =>
    /^use when\b/i.test(member.skill.description.trim()),
  );
  const pool = useWhen.length > 0 ? useWhen : members;
  return pool.reduce<Keyed | undefined>(
    (best, member) =>
      best === undefined ||
      member.skill.description.trim().length >
        best.skill.description.trim().length
        ? member
        : best,
    undefined,
  );
}

/** Each member's steps in turn, near-duplicates and the overflow dropped. */
function unionSteps(members: readonly Keyed[]): string[] {
  const steps: string[] = [];
  for (const member of members) {
    for (const step of member.skill.steps) {
      if (steps.length >= MAX_STEPS) return steps;
      if (steps.some((kept) => isNearDuplicateStep(kept, step))) continue;
      steps.push(step);
    }
  }
  return steps;
}

export interface SkillDedupe {
  /** Per input list, the merged skills it holds, without repeats. */
  lists: Skill[][];
  before: number;
  after: number;
}

/**
 * Merges near-identical skills across all lists (one list per group). Two
 * skills share a cluster when a chain of near-identical pairs links them.
 * Each list then holds every merged skill one of its skills went into, once;
 * a merged skill is the same object in every list.
 */
export function dedupeSkills(
  lists: readonly (readonly DedupeSkill[])[],
): SkillDedupe {
  const items = lists.flat().map(keyed);
  const parent = items.map((_, i) => i);
  const root = (i: number): number => {
    let at = i;
    while (parent[at] !== at) at = parent[at] ?? at;
    return at;
  };
  items.forEach((item, i) => {
    for (let j = 0; j < i; j += 1) {
      const other = items[j];
      if (other && similar(other, item)) parent[root(i)] = root(j);
    }
  });
  const clusters = new Map<number, Keyed[]>();
  items.forEach((item, i) => {
    const key = root(i);
    clusters.set(key, [...(clusters.get(key) ?? []), item]);
  });
  const merged = new Map<number, Skill>();
  for (const [key, members] of clusters) {
    const lead = bestDescribed(members);
    const ordered = [
      ...(lead ? [lead] : []),
      ...members.filter((m) => m !== lead),
    ];
    merged.set(key, {
      name: bestName(members),
      description: lead?.skill.description.trim() ?? "",
      steps: unionSteps(ordered),
    });
  }
  let offset = 0;
  return {
    lists: lists.map((list) => {
      const roots = list.map((_, i) => root(offset + i));
      offset += list.length;
      return [...new Set(roots)].flatMap((key) => {
        const skill = merged.get(key);
        return skill ? [skill] : [];
      });
    }),
    before: items.length,
    after: merged.size,
  };
}
