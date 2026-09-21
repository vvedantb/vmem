import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GatewayAuthenticationError } from "@ai-sdk/gateway";
import { describe, expect, it } from "vitest";
import {
  JEV_API_KEY_ENV,
  SYSTEMONE_DEFAULT_MODEL,
  SYSTEMONE_QUESTION_TYPES,
  SystemOneHttpError,
  SystemOneParseError,
  evaluateSystemOne,
  readSystemOneApiKey,
  type GatewayEvaluateCall,
  type SystemOneQuestion,
} from "../../engine/llm/systemOneClient";

const clientSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../engine/llm/systemOneClient.ts",
  ),
  "utf8",
);

const sampleQuestions: Record<string, SystemOneQuestion> = {
  is_urgent: {
    type: "noul",
    instructions: "Does this convey urgency?",
    criteria: {
      true: "Explicitly time-sensitive",
      false: "No urgency expressed",
    },
  },
  department: {
    type: "choice",
    instructions: "Which team should handle this?",
    criteria: {
      billing: "Payments",
      technical: "Bugs",
      sales: "Pricing",
    },
  },
  frustration: {
    type: "score",
    instructions: "How frustrated is the customer?",
    criteria: ["Calm", "Frustrated", "Very angry"],
  },
};

describe("readSystemOneApiKey", () => {
  it("reads AI_GATEWAY_API_KEY and ignores leftover TypeSafe env names", () => {
    expect(JEV_API_KEY_ENV).toBe("AI_GATEWAY_API_KEY");
    expect(
      readSystemOneApiKey({
        AI_GATEWAY_API_KEY: "  gw-key  ",
        TYPESAFE_API_KEY: "ts-key",
        TYPESAFE_AI_API_KEY: "sdk-key",
        JEV_API_KEY: "alias-key",
      }),
    ).toBe("gw-key");
    expect(
      readSystemOneApiKey({
        TYPESAFE_API_KEY: "ts-key",
        JEV_API_KEY: "alias-key",
      }),
    ).toBeUndefined();
  });

  it("skips empty values so retrieve can stay on the hybrid path", () => {
    expect(readSystemOneApiKey({})).toBeUndefined();
    expect(readSystemOneApiKey({ AI_GATEWAY_API_KEY: "   " })).toBeUndefined();
  });
});

describe("evaluateSystemOne", () => {
  it("calls experimental_evaluate on typesafe-ai/jev and maps boolean probability to noul", async () => {
    expect(SYSTEMONE_QUESTION_TYPES).toEqual(["noul", "choice", "score"]);
    expect(clientSource).toContain("experimental_evaluate");
    expect(clientSource).toContain('from "ai"');
    expect(clientSource).toContain('from "@ai-sdk/gateway"');
    expect(clientSource).toContain("zeroDataRetention");
    expect(clientSource).not.toContain("api.typesafe.ai");
    expect(clientSource).not.toContain("Authorization");

    const calls: GatewayEvaluateCall[] = [];
    const result = await evaluateSystemOne(
      {
        apiKey: "test-key",
        state: "Help! payouts failing.",
        questions: sampleQuestions,
        tag: "retrieve",
      },
      async (call) => {
        calls.push(call);
        return {
          modelId: "typesafe-ai/jev",
          inputTokens: 312,
          outputTokens: 48,
          answers: {
            is_urgent: { type: "boolean", probability: 0.92 },
            department: {
              type: "choice",
              choice: "technical",
              probabilities: { billing: 0.08, technical: 0.85, sales: 0.07 },
            },
            frustration: {
              type: "score",
              score: 1.6,
              probabilities: { "0": 0.05, "1": 0.3, "2": 0.65 },
            },
          },
        };
      },
    );

    expect(calls).toEqual([
      {
        model: SYSTEMONE_DEFAULT_MODEL,
        state: "Help! payouts failing.",
        maxRetries: 1,
        timeoutMs: 30_000,
        tag: "retrieve",
        zeroDataRetention: true,
        questions: {
          is_urgent: {
            type: "boolean",
            instructions: "Does this convey urgency?",
            criteria: {
              true: "Explicitly time-sensitive",
              false: "No urgency expressed",
            },
          },
          department: sampleQuestions.department,
          frustration: sampleQuestions.frustration,
        },
      },
    ]);
    expect(result.model).toBe("typesafe-ai/jev");
    expect(result.answers.is_urgent).toEqual({ type: "noul", noul: 0.92 });
    expect(result.answers.department).toEqual({
      type: "choice",
      choice: "technical",
      probabilities: { billing: 0.08, technical: 0.85, sales: 0.07 },
      confidence: 0.85,
    });
    expect(result.answers.frustration).toEqual({
      type: "score",
      score: 1.6,
      probabilities: { "0": 0.05, "1": 0.3, "2": 0.65 },
    });
    expect(result.usage).toEqual({ input_tokens: 312, output_tokens: 48 });
  });

  it("rejects boolean, bounding_box, and nested score.criteria", async () => {
    const evaluateImpl = async () => {
      throw new Error("should not call");
    };
    const invalid = {
      apiKey: "test-key",
      state: "x",
    };

    await expect(
      evaluateSystemOne(
        {
          ...invalid,
          questions: {
            keep: { type: "boolean", instructions: "keep?" },
          },
        },
        evaluateImpl,
      ),
    ).rejects.toBeInstanceOf(SystemOneParseError);

    await expect(
      evaluateSystemOne(
        {
          ...invalid,
          questions: {
            box: {
              type: "bounding_box",
              instructions: "where?",
              bounding_box: { criteria: ["logo"] },
            },
          },
        },
        evaluateImpl,
      ),
    ).rejects.toBeInstanceOf(SystemOneParseError);

    await expect(
      evaluateSystemOne(
        {
          ...invalid,
          questions: {
            relevance: {
              type: "score",
              instructions: "How relevant?",
              score: {
                criteria: ["irrelevant", "weakly related", "directly answers"],
              },
            },
          },
        },
        evaluateImpl,
      ),
    ).rejects.toBeInstanceOf(SystemOneParseError);
  });

  it("maps gateway auth failures without leaking the key", async () => {
    await expect(
      evaluateSystemOne(
        {
          apiKey: "secret-key",
          state: "x",
          questions: {
            ok: { type: "noul", instructions: "yes?" },
          },
        },
        async () => {
          throw new GatewayAuthenticationError({
            message: "rejected secret-key",
            statusCode: 401,
          });
        },
      ),
    ).rejects.toBeInstanceOf(SystemOneHttpError);

    let thrown: unknown;
    try {
      await evaluateSystemOne(
        {
          apiKey: "secret-key",
          state: "x",
          questions: {
            ok: { type: "noul", instructions: "yes?" },
          },
        },
        async () => {
          throw new Error("bearer secret-key");
        },
      );
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).not.toContain("secret-key");
    expect(String(thrown)).toContain("[redacted]");
  });
});
