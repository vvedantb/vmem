import { truncateAtWord } from "../llm/truncateAtWord";
import {
  evaluateSystemOne,
  type EvaluateSystemOneArgs,
  type SystemOneQuestion,
  type SystemOneResponse,
} from "../llm/systemOneClient";
import { JEV_BEST_NONE, JEV_GATE_HEAD, JEV_SCORE_CRITERIA } from "./jevGate";

export type SkillIndexSlice = {
  name: string;
  description: string;
};

export type SkillRecommendation = SkillIndexSlice & {
  score: number;
};

export type SkillRecommendResult = {
  query: string;
  source: "jev" | "lexical";
  skills: SkillRecommendation[];
};

const KEEP_INSTRUCTIONS =
  "Does this skill apply to the user's task (not merely shared keywords)?";
const SCORE_INSTRUCTIONS = "How well does this skill fit the task?";
const BEST_INSTRUCTIONS =
  "Which skill is the single best fit for the task? Pick none if none apply.";

function relevantKey(index: number): string {
  return `rel_${String(index)}`;
}

function scoreKey(index: number): string {
  return `sc_${String(index)}`;
}

function hitOptionKey(index: number): string {
  return `h${String(index)}`;
}

export function tokenizeSkillQuery(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 1);
}

function tokenMatches(token: string, hayTokens: readonly string[]): boolean {
  if (token.length <= 2) return hayTokens.includes(token);
  return hayTokens.some(
    (hay) => hay === token || hay.startsWith(token) || token.startsWith(hay),
  );
}

export function lexicalSkillScore(
  query: string,
  skill: SkillIndexSlice,
): number {
  const tokens = tokenizeSkillQuery(query);
  if (tokens.length === 0) return 0;
  const nameTokens = tokenizeSkillQuery(skill.name);
  const hayTokens = tokenizeSkillQuery(`${skill.name} ${skill.description}`);
  let hits = 0;
  for (const token of tokens) {
    if (tokenMatches(token, hayTokens)) hits += 1;
    if (tokenMatches(token, nameTokens)) hits += 0.5;
  }
  return hits / tokens.length;
}

export function rankSkillsLexically(
  query: string,
  skills: readonly SkillIndexSlice[],
): SkillRecommendation[] {
  return skills
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      score: lexicalSkillScore(query, skill),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
}

function noulForIndex(
  answers: SystemOneResponse["answers"],
  index: number,
): number | undefined {
  const answer = answers[relevantKey(index)];
  if (answer === undefined || answer.type !== "noul") return undefined;
  return answer.noul;
}

function scoreForIndex(
  answers: SystemOneResponse["answers"],
  index: number,
): number | undefined {
  const answer = answers[scoreKey(index)];
  if (answer === undefined || answer.type !== "score") return undefined;
  return answer.score;
}

function bestHitIndex(
  answers: SystemOneResponse["answers"],
  hitCount: number,
): number | undefined {
  const answer = answers.best;
  if (answer === undefined || answer.type !== "choice") return undefined;
  if (answer.choice === JEV_BEST_NONE) return undefined;
  for (let i = 0; i < hitCount; i += 1) {
    if (answer.choice === hitOptionKey(i)) return i;
  }
  return undefined;
}

export function buildJevSkillQuestions(
  skills: readonly SkillIndexSlice[],
): Record<string, SystemOneQuestion> {
  const questions: Record<string, SystemOneQuestion> = {};
  const choiceCriteria: Record<string, string | null> = {
    [JEV_BEST_NONE]: "None of the skills apply to the task",
  };
  for (let i = 0; i < skills.length; i += 1) {
    const skill = skills[i];
    if (skill === undefined) continue;
    questions[relevantKey(i)] = {
      type: "noul",
      instructions: KEEP_INSTRUCTIONS,
      criteria: {
        true: "The skill's playbook is a good fit for this task",
        false: "Lexical overlap only, wrong domain, or unrelated",
      },
    };
    questions[scoreKey(i)] = {
      type: "score",
      instructions: SCORE_INSTRUCTIONS,
      criteria: [...JEV_SCORE_CRITERIA],
    };
    choiceCriteria[hitOptionKey(i)] = `${skill.name}: ${truncateAtWord(
      skill.description,
      160,
    )}`;
  }
  questions.best = {
    type: "choice",
    instructions: BEST_INSTRUCTIONS,
    criteria: choiceCriteria,
  };
  return questions;
}

function applySkillAnswers(
  ranked: readonly SkillRecommendation[],
  response: SystemOneResponse,
): SkillRecommendation[] {
  const head = ranked.slice(0, JEV_GATE_HEAD);
  const tail = ranked.slice(JEV_GATE_HEAD);
  const bestIndex = bestHitIndex(response.answers, head.length);
  const scored: SkillRecommendation[] = [];
  for (let i = 0; i < head.length; i += 1) {
    const skill = head[i];
    if (skill === undefined) continue;
    const noul = noulForIndex(response.answers, i);
    const jevScore = scoreForIndex(response.answers, i);
    const score = (jevScore ?? 0) * 10 + (noul ?? 0) * 2 + skill.score * 0.01;
    scored.push({ ...skill, score });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
  if (bestIndex !== undefined) {
    const best = head[bestIndex];
    if (best !== undefined) {
      const idx = scored.findIndex((row) => row.name === best.name);
      if (idx > 0) {
        const [winner] = scored.splice(idx, 1);
        if (winner !== undefined) scored.unshift(winner);
      }
    }
  }
  return [...scored, ...tail];
}

export async function recommendSkills(args: {
  query: string;
  skills: readonly SkillIndexSlice[];
  apiKey?: string;
  limit?: number;
  evaluate?: (args: EvaluateSystemOneArgs) => Promise<SystemOneResponse>;
}): Promise<SkillRecommendResult> {
  const limit = Math.max(0, args.limit ?? args.skills.length);
  const lexical = rankSkillsLexically(args.query, args.skills).slice(
    0,
    Math.max(limit, JEV_GATE_HEAD),
  );
  const slicedLexical = lexical.slice(0, Math.max(0, limit));
  if (
    args.apiKey === undefined ||
    args.query.trim().length === 0 ||
    lexical.length === 0
  ) {
    return { query: args.query, source: "lexical", skills: slicedLexical };
  }

  const head = lexical.slice(0, JEV_GATE_HEAD);
  const evaluate = args.evaluate ?? evaluateSystemOne;
  try {
    const response = await evaluate({
      apiKey: args.apiKey,
      state: {
        query: args.query,
        skills: head.map((skill) => ({
          name: skill.name,
          description: truncateAtWord(skill.description, 240),
        })),
      },
      questions: buildJevSkillQuestions(head),
    });
    return {
      query: args.query,
      source: "jev",
      skills: applySkillAnswers(lexical, response).slice(0, Math.max(0, limit)),
    };
  } catch {
    return { query: args.query, source: "lexical", skills: slicedLexical };
  }
}
