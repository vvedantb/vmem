import { z } from "zod";

export const SYSTEMONE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const SYSTEMONE_DEFAULT_MODEL = "jev-latest";
const SYSTEMONE_TIMEOUT_MS = 20_000;

export const SYSTEMONE_API_KEY_ENV_NAMES = [
  "TYPESAFE_API_KEY",
  "TYPESAFE_AI_API_KEY",
  "JEV_API_KEY",
] as const;

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
  criteria: z.array(z.string()).min(2),
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
  probabilities: z.record(z.number()),
  confidence: z.number(),
});

const scoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number(),
  legend: z.record(z.string()),
  probabilities: z.record(z.number()),
  confidence: z.number(),
});

const systemOneAnswerSchema = z.discriminatedUnion("type", [
  noulAnswerSchema,
  choiceAnswerSchema,
  scoreAnswerSchema,
]);

const systemOneQuestionsMapSchema = z.record(systemOneQuestionSchema);

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
  for (const name of SYSTEMONE_API_KEY_ENV_NAMES) {
    const value = env[name];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

export interface EvaluateSystemOneArgs {
  apiKey: string;
  state: unknown;
  questions: Record<string, SystemOneQuestion>;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function evaluateSystemOne(
  args: EvaluateSystemOneArgs,
): Promise<SystemOneResponse> {
  const questions = systemOneQuestionsMapSchema.safeParse(args.questions);
  if (!questions.success) {
    throw new SystemOneParseError();
  }
  const fetchImpl = args.fetchImpl ?? fetch;
  const timeoutMs = args.timeoutMs ?? SYSTEMONE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(SYSTEMONE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: args.state,
        model: args.model ?? SYSTEMONE_DEFAULT_MODEL,
        questions: questions.data,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === "AbortError") {
      throw new SystemOneHttpError(408);
    }
    throw error;
  }
  clearTimeout(timer);
  if (!response.ok) {
    throw new SystemOneHttpError(response.status);
  }
  const json: unknown = await response.json();
  const parsed = systemOneResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new SystemOneParseError();
  }
  return parsed.data;
}
