import { describe, expect, it, vi } from "vitest";
import type { SystemOneResponse } from "../../engine/llm/systemOneClient";
import { JEV_BEST_NONE } from "../../engine/memory/jevGate";
import {
  buildJevSkillQuestions,
  lexicalSkillScore,
  recommendSkills,
} from "../../engine/memory/jevSkillRecommend";

const wiki = {
  name: "wiki-writeup",
  description: "Chapter-style wiki explainer in Learning/ to read later",
};
const teach = {
  name: "teach-me",
  description:
    "Interactive tutor: one step per turn, validate before advancing",
};
const deploy = {
  name: "deploy-vercel",
  description: "Ship a web app to Vercel production",
};

function jevResponse(args: {
  best: string;
  wikiNoul?: number;
  teachNoul?: number;
  wikiScore?: number;
  teachScore?: number;
}): SystemOneResponse {
  return {
    model: "jev-latest",
    answers: {
      rel_0: { type: "noul", noul: args.wikiNoul ?? 0.9 },
      rel_1: { type: "noul", noul: args.teachNoul ?? 0.1 },
      sc_0: {
        type: "score",
        score: args.wikiScore ?? 2,
        legend: {
          "0": "irrelevant",
          "1": "weakly related",
          "2": "directly answers",
        },
        probabilities: { "0": 0.05, "1": 0.1, "2": 0.85 },
        confidence: 0.8,
      },
      sc_1: {
        type: "score",
        score: args.teachScore ?? 0,
        legend: {
          "0": "irrelevant",
          "1": "weakly related",
          "2": "directly answers",
        },
        probabilities: { "0": 0.9, "1": 0.08, "2": 0.02 },
        confidence: 0.75,
      },
      best: {
        type: "choice",
        choice: args.best,
        probabilities: { h0: 0.8, h1: 0.1, none: 0.1 },
        confidence: 0.7,
      },
    },
  };
}

describe("lexicalSkillScore", () => {
  it("ranks description overlap over unrelated skills", () => {
    expect(lexicalSkillScore("wiki writeup later", wiki)).toBeGreaterThan(
      lexicalSkillScore("wiki writeup later", deploy),
    );
    expect(lexicalSkillScore("interactive tutor", teach)).toBeGreaterThan(
      lexicalSkillScore("interactive tutor", wiki),
    );
  });
});

describe("recommendSkills fail-open", () => {
  it("returns lexical ranking when the gateway key is missing", async () => {
    const result = await recommendSkills({
      query: "write a wiki explainer to read later",
      skills: [deploy, wiki, teach],
    });
    expect(result.source).toBe("lexical");
    expect(result.skills[0]?.name).toBe("wiki-writeup");
  });

  it("returns lexical ranking when Jev throws", async () => {
    const evaluate = vi.fn(async () => {
      throw new Error("network");
    });
    const result = await recommendSkills({
      query: "write a wiki explainer to read later",
      skills: [deploy, wiki, teach],
      apiKey: "test-key",
      evaluate,
    });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(result.source).toBe("lexical");
    expect(result.skills[0]?.name).toBe("wiki-writeup");
    expect(result.skills.map((row) => row.name)).toEqual(
      expect.arrayContaining(["wiki-writeup", "teach-me", "deploy-vercel"]),
    );
  });

  it("does not call Jev for an empty query or empty catalog", async () => {
    const evaluate = vi.fn(async () => jevResponse({ best: "h0" }));
    const emptyQuery = await recommendSkills({
      query: "   ",
      skills: [wiki],
      apiKey: "test-key",
      evaluate,
    });
    const emptyCatalog = await recommendSkills({
      query: "wiki",
      skills: [],
      apiKey: "test-key",
      evaluate,
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(emptyQuery.source).toBe("lexical");
    expect(emptyQuery.skills.map((row) => row.name)).toEqual(["wiki-writeup"]);
    expect(emptyCatalog.skills).toEqual([]);
  });
});

describe("recommendSkills Jev shortlist", () => {
  it("builds skill-fit questions rather than memory-keep prompts", () => {
    const questions = buildJevSkillQuestions([wiki, teach]);
    expect(questions.rel_0).toMatchObject({
      type: "noul",
      instructions: expect.stringContaining("skill"),
    });
    expect(questions.best).toMatchObject({
      type: "choice",
      criteria: expect.objectContaining({
        [JEV_BEST_NONE]: expect.stringContaining("None of the skills"),
        h0: expect.stringContaining("wiki-writeup"),
      }),
    });
  });

  it("promotes the Jev choice winner and records source jev", async () => {
    const evaluate = vi.fn(async () =>
      jevResponse({
        best: "h1",
        wikiNoul: 0.4,
        teachNoul: 0.85,
        wikiScore: 1,
        teachScore: 2,
      }),
    );
    const result = await recommendSkills({
      query: "wiki writeup",
      skills: [wiki, teach],
      apiKey: "test-key",
      evaluate,
    });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(result.source).toBe("jev");
    expect(result.skills[0]?.name).toBe("teach-me");
  });
});
