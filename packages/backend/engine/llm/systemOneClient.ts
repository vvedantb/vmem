import {
  experimental_evaluate as evaluate,
  Experimental_EvaluationUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  NoSuchModelError,
  RetryError,
  type Experimental_EvaluationQuestion,
  type JSONValue,
} from "ai";
import {
  GatewayAuthenticationError,
  GatewayError,
  GatewayInvalidRequestError,
  GatewayModelNotFoundError,
  GatewayRateLimitError,
} from "@ai-sdk/gateway";
import { z } from "zod";

/** Gateway model id. The SDK reads `AI_GATEWAY_API_KEY`. */
export const SYSTEMONE_DEFAULT_MODEL = "typesafe-ai/jev";
export const JEV_API_KEY_ENV = "AI_GATEWAY_API_KEY";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;
const DEFAULT_TAG = "vmem-jev";

export const SYSTEMONE_QUESTION_TYPES = ["noul", "choice", "score"] as const;

const noulCriteriaSchema = z.object({
  true: z.string().optional(),
  false: z.string().optional(),
});

const noulQuestionSchema = z.object({
  type: z.literal("noul"),
  instructions: z.string(),
  criteria: noulCriteriaSchema.optional(),
});

const choiceQuestionSchema = z.object({
  type: z.literal("choice"),
  instructions: z.string(),
  criteria: z.record(z.string().nullable()),
});

const scoreQuestionSchema = z.object({
  type: z.literal("score"),
  instructions: z.string(),
  criteria: z.array(z.string()).min(1),
});

const systemOneQuestionSchema = z.discriminatedUnion("type", [
  noulQuestionSchema,
  choiceQuestionSchema,
  scoreQuestionSchema,
]);

const noulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: z.number(),
});

const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.number()).optional(),
  confidence: z.number().optional(),
});

const scoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number(),
  legend: z.record(z.string()).optional(),
  probabilities: z.record(z.number()).optional(),
  confidence: z.number().optional(),
});

const systemOneAnswerSchema = z.discriminatedUnion("type", [
  noulAnswerSchema,
  choiceAnswerSchema,
  scoreAnswerSchema,
]);

const systemOneQuestionsMapSchema = z.record(systemOneQuestionSchema);

const sdkAnswerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("boolean"),
    probability: z.number(),
  }),
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    probabilities: z.record(z.number()).optional(),
  }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    probabilities: z.record(z.number()).optional(),
  }),
]);

const sdkAnswersSchema = z.record(sdkAnswerSchema);

const systemOneUsageSchema = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
  })
  .optional();

const systemOneResponseSchema = z.object({
  model: z.string(),
  answers: z.record(systemOneAnswerSchema),
  usage: systemOneUsageSchema,
});

export type SystemOneQuestion = z.infer<typeof systemOneQuestionSchema>;
export type SystemOneResponse = z.infer<typeof systemOneResponseSchema>;

export class SystemOneHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`systemone http ${String(status)}`);
    this.name = "SystemOneHttpError";
    this.status = status;
  }
}

export class SystemOneParseError extends Error {
  constructor() {
    super("systemone response failed validation");
    this.name = "SystemOneParseError";
  }
}

export function readSystemOneApiKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = env[JEV_API_KEY_ENV];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface GatewayEvaluateCall {
  model: string;
  state: unknown;
  questions: Record<string, Experimental_EvaluationQuestion>;
  maxRetries: number;
  timeoutMs: number;
  tag: string;
  zeroDataRetention: true;
}

interface SdkEvaluateResult {
  modelId: string;
  answers: unknown;
  inputTokens?: number;
  outputTokens?: number;
}

export interface EvaluateSystemOneArgs {
  apiKey: string;
  state: unknown;
  questions: unknown;
  model?: string;
  timeoutMs?: number;
  tag?: string;
}

export async function evaluateSystemOne(
  args: EvaluateSystemOneArgs,
  evaluateImpl: (
    call: GatewayEvaluateCall,
  ) => Promise<SdkEvaluateResult> = evaluateWithSdk,
): Promise<SystemOneResponse> {
  const questions = systemOneQuestionsMapSchema.safeParse(args.questions);
  if (!questions.success) {
    throw new SystemOneParseError();
  }
  if (args.apiKey.trim().length === 0) {
    throw new Error("AI_GATEWAY_API_KEY is not set");
  }

  const call: GatewayEvaluateCall = {
    model: args.model ?? SYSTEMONE_DEFAULT_MODEL,
    state: args.state,
    questions: toSdkQuestions(questions.data),
    maxRetries: MAX_RETRIES,
    timeoutMs: args.timeoutMs ?? REQUEST_TIMEOUT_MS,
    tag: args.tag && args.tag.trim().length > 0 ? args.tag.trim() : DEFAULT_TAG,
    zeroDataRetention: true,
  };

  try {
    const result = await evaluateImpl(call);
    return mapSdkResult(result);
  } catch (error) {
    throw classifyError(error, args.apiKey);
  }
}

function toSdkQuestions(
  questions: Record<string, SystemOneQuestion>,
): Record<string, Experimental_EvaluationQuestion> {
  const out: Record<string, Experimental_EvaluationQuestion> = {};
  for (const [id, question] of Object.entries(questions)) {
    if (question.type === "noul") {
      out[id] = {
        type: "boolean",
        instructions: question.instructions,
        ...(question.criteria === undefined
          ? {}
          : { criteria: question.criteria }),
      };
      continue;
    }
    out[id] = question;
  }
  return out;
}

function mapSdkResult(result: SdkEvaluateResult): SystemOneResponse {
  const parsed = sdkAnswersSchema.safeParse(result.answers);
  if (!parsed.success) throw new SystemOneParseError();
  const answers: SystemOneResponse["answers"] = {};
  for (const [id, answer] of Object.entries(parsed.data)) {
    if (answer.type === "boolean") {
      answers[id] = { type: "noul", noul: answer.probability };
      continue;
    }
    if (answer.type === "choice") {
      const selected = answer.probabilities?.[answer.choice];
      answers[id] = {
        type: "choice",
        choice: answer.choice,
        ...(answer.probabilities === undefined
          ? {}
          : { probabilities: answer.probabilities }),
        ...(typeof selected === "number" && Number.isFinite(selected)
          ? { confidence: selected }
          : {}),
      };
      continue;
    }
    answers[id] = {
      type: "score",
      score: answer.score,
      ...(answer.probabilities === undefined
        ? {}
        : { probabilities: answer.probabilities }),
    };
  }
  const response = systemOneResponseSchema.safeParse({
    model: result.modelId,
    answers,
    usage: {
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    },
  });
  if (!response.success) throw new SystemOneParseError();
  return response.data;
}

function isEvaluationState(
  value: unknown,
): value is string | { [key: string]: JSONValue } | readonly JSONValue[] {
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return true;
  return value !== null && typeof value === "object";
}

async function evaluateWithSdk(
  call: GatewayEvaluateCall,
): Promise<SdkEvaluateResult> {
  if (!isEvaluationState(call.state)) throw new SystemOneParseError();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, call.timeoutMs);
  try {
    const result = await evaluate({
      model: call.model,
      state: call.state,
      questions: call.questions,
      maxRetries: call.maxRetries,
      abortSignal: controller.signal,
      providerOptions: {
        gateway: {
          zeroDataRetention: call.zeroDataRetention,
          tags: [call.tag],
        },
      },
    });
    return {
      modelId: result.response.modelId,
      answers: result.answers,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    };
  } finally {
    clearTimeout(timer);
  }
}

function classifyError(error: unknown, apiKey: string): Error {
  if (RetryError.isInstance(error))
    return classifyError(error.lastError, apiKey);
  if (
    error instanceof SystemOneHttpError ||
    error instanceof SystemOneParseError
  ) {
    return error;
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new SystemOneHttpError(408);
  }
  if (
    Experimental_EvaluationUnsupportedQuestionTypeError.isInstance(error) ||
    InvalidArgumentError.isInstance(error) ||
    GatewayInvalidRequestError.isInstance(error) ||
    InvalidResponseDataError.isInstance(error)
  ) {
    return new SystemOneParseError();
  }
  if (GatewayAuthenticationError.isInstance(error)) {
    return new SystemOneHttpError(error.statusCode);
  }
  if (
    NoSuchModelError.isInstance(error) ||
    GatewayModelNotFoundError.isInstance(error)
  ) {
    return new SystemOneHttpError(404);
  }
  if (
    GatewayRateLimitError.isInstance(error) ||
    GatewayError.isInstance(error)
  ) {
    return new SystemOneHttpError(error.statusCode);
  }
  const message =
    error instanceof Error ? error.message : "jev evaluate failed";
  if (apiKey.length > 0 && message.includes(apiKey)) {
    return new Error(message.replaceAll(apiKey, "[redacted]"));
  }
  return error instanceof Error ? error : new Error(message);
}
