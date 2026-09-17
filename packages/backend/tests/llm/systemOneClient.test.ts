import { describe, expect, it, vi } from "vitest";
import {
  SYSTEMONE_API_KEY_ENV_NAMES,
  SYSTEMONE_DEFAULT_MODEL,
  SYSTEMONE_ENDPOINT,
  SYSTEMONE_QUESTION_TYPES,
  SystemOneHttpError,
  SystemOneParseError,
  evaluateSystemOne,
  readSystemOneApiKey,
  type SystemOneQuestion,
} from "../../engine/llm/systemOneClient";

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const sampleQuestions: Record<string, SystemOneQuestion> = {
  is_urgent: {
    type: "noul",
    instructions: "Does this convey urgency?",
    noul: {
      criteria: {
        true: "Explicitly time-sensitive",
        false: "No urgency expressed",
      },
    },
  },
  department: {
    type: "choice",
    instructions: "Which team should handle this?",
    choice: {
      criteria: {
        billing: "Payments",
        technical: "Bugs",
        sales: "Pricing",
      },
    },
  },
  frustration: {
    type: "score",
    instructions: "How frustrated is the customer?",
    score: {
      criteria: ["Calm", "Frustrated", "Very angry"],
    },
  },
  logo: {
    type: "bounding_box",
    instructions: "Where is the logo?",
    bounding_box: {
      criteria: ["logo"],
    },
  },
};

const sampleAnswers = {
  is_urgent: { type: "noul" as const, noul: 0.92 },
  department: {
    type: "choice" as const,
    choice: "technical",
    probabilities: { billing: 0.08, technical: 0.85, sales: 0.07 },
    confidence: 0.82,
  },
  frustration: {
    type: "score" as const,
    score: 1.6,
    legend: { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
    probabilities: { "0": 0.05, "1": 0.3, "2": 0.65 },
    confidence: 0.78,
  },
  logo: {
    type: "bounding_box" as const,
    bounding_box: { x0: 12, y0: 8, x1: 40, y1: 22 },
    confidence: 0.7,
  },
};

describe("readSystemOneApiKey", () => {
  it("prefers TYPESAFE_API_KEY then SDK then local alias", () => {
    expect(SYSTEMONE_API_KEY_ENV_NAMES).toEqual([
      "TYPESAFE_API_KEY",
      "TYPESAFE_AI_API_KEY",
      "JEV_API_KEY",
    ]);
    expect(
      readSystemOneApiKey({
        TYPESAFE_API_KEY: "  ts-key  ",
        TYPESAFE_AI_API_KEY: "sdk-key",
        JEV_API_KEY: "alias-key",
      }),
    ).toBe("ts-key");
    expect(
      readSystemOneApiKey({
        TYPESAFE_AI_API_KEY: "sdk-key",
        JEV_API_KEY: "alias-key",
      }),
    ).toBe("sdk-key");
    expect(readSystemOneApiKey({ JEV_API_KEY: "alias-key" })).toBe("alias-key");
  });

  it("skips empty values so retrieve can stay on the hybrid path", () => {
    expect(readSystemOneApiKey({})).toBeUndefined();
    expect(
      readSystemOneApiKey({
        TYPESAFE_API_KEY: "   ",
        TYPESAFE_AI_API_KEY: "",
      }),
    ).toBeUndefined();
  });
});

describe("evaluateSystemOne", () => {
  it("POSTs nested noul/choice/score/bounding_box questions with bearer auth", async () => {
    expect(SYSTEMONE_QUESTION_TYPES).toEqual([
      "noul",
      "choice",
      "score",
      "bounding_box",
    ]);
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonResponse({
          model: "jev-1.13.0",
          answers: sampleAnswers,
          usage: { input_tokens: 312, output_tokens: 48 },
        }),
    );

    const result = await evaluateSystemOne({
      apiKey: "test-key",
      fetchImpl,
      state: "Help! payouts failing.",
      questions: sampleQuestions,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      SYSTEMONE_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
      }),
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.body).toBe(
      JSON.stringify({
        state: "Help! payouts failing.",
        model: SYSTEMONE_DEFAULT_MODEL,
        questions: sampleQuestions,
      }),
    );
    expect(result.answers.is_urgent).toEqual({ type: "noul", noul: 0.92 });
    expect(result.answers.department).toEqual(sampleAnswers.department);
    expect(result.answers.frustration).toEqual(sampleAnswers.frustration);
    expect(result.answers.logo).toEqual(sampleAnswers.logo);
    expect(result.usage).toEqual({ input_tokens: 312, output_tokens: 48 });
  });

  it("rejects boolean questions and score without score.criteria", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ model: "jev-latest" }));
    const invalid = {
      apiKey: "test-key",
      fetchImpl,
      state: "x",
    };

    await expect(
      evaluateSystemOne({
        ...invalid,
        questions: {
          keep: {
            type: "boolean",
            instructions: "keep?",
          },
        },
      }),
    ).rejects.toBeInstanceOf(SystemOneParseError);

    await expect(
      evaluateSystemOne({
        ...invalid,
        questions: {
          relevance: {
            type: "score",
            instructions: "How relevant?",
            criteria: ["irrelevant", "weakly related", "directly answers"],
          },
        },
      }),
    ).rejects.toBeInstanceOf(SystemOneParseError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on HTTP errors and invalid bodies without leaking the key", async () => {
    await expect(
      evaluateSystemOne({
        apiKey: "secret-key",
        fetchImpl: async () => jsonResponse({ error: "nope" }, 401),
        state: "x",
        questions: {
          ok: { type: "noul", instructions: "yes?" },
        },
      }),
    ).rejects.toBeInstanceOf(SystemOneHttpError);

    await expect(
      evaluateSystemOne({
        apiKey: "secret-key",
        fetchImpl: async () => jsonResponse({ model: "jev-latest" }),
        state: "x",
        questions: {
          ok: { type: "noul", instructions: "yes?" },
        },
      }),
    ).rejects.toBeInstanceOf(SystemOneParseError);

    let thrown: unknown;
    try {
      await evaluateSystemOne({
        apiKey: "secret-key",
        fetchImpl: async () => jsonResponse({ error: "nope" }, 401),
        state: "x",
        questions: {
          ok: { type: "noul", instructions: "yes?" },
        },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SystemOneHttpError);
    expect(String(thrown)).not.toContain("secret-key");
  });
});
