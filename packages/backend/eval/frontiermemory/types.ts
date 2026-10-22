import { z } from "zod";

export type Outcome = "PASS" | "FAIL" | "UNKNOWN";

export type TrajectoryFormat =
  | "atif"
  | "claude-code"
  | "codex"
  | "opencode"
  | "acp"
  | "generic";

export interface NormalizedRun {
  file: string;
  /** sha256 prefix of the raw file. Cache key for LLM stages. */
  hash: string;
  format: TrajectoryFormat;
  /** The actual task text, harness boilerplate removed. */
  taskPrompt: string;
  userFeedback: string[];
  /** Assistant text, reasoning, tool calls and results, oldest first. Middle steps may be omitted. */
  trajectory: string[];
  outcome: Outcome;
  /** Epoch ms of the earliest timestamp in the run, else null. */
  orderHint: number | null;
  approxTokens: number;
  /** Case-insensitive count of each task keyword in the whole raw run. */
  mentions: Record<string, number>;
}

const keywordSchema = z.string().trim().toLowerCase().min(3);

export const taskSpecSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  title: z.string().min(1),
  description: z.string(),
  /** Distinctive terms. A run matches only if its prompt names one, or its body names one often. */
  keywords: z.array(keywordSchema).min(1),
  /**
   * Optional weaker body rule for a name that task runs say only a few times
   * (a package name): `term` at least `min` times plus `with` at least once.
   */
  cooccur: z
    .object({
      term: keywordSchema,
      with: keywordSchema,
      min: z.number().int().min(2),
    })
    .optional(),
});
export type TaskSpec = z.infer<typeof taskSpecSchema>;

export const lessonSchema = z.object({
  lesson: z.string().trim().min(1),
  kind: z.enum(["procedure", "preference", "pitfall", "fact"]),
  outcome_link: z.enum(["led_to_pass", "led_to_fail", "unclear"]),
  scope: z.enum(["task-specific", "general"]),
  evidence: z.string().catch(""),
  supersedes: z
    .string()
    .nullish()
    .transform((value) => (value && value.trim().length > 0 ? value : null)),
});
export type Lesson = z.infer<typeof lessonSchema>;
export type LessonKind = Lesson["kind"];

/** Lessons from one run, with the run facts merge needs. */
export interface RunLessons {
  file: string;
  outcome: Outcome;
  orderHint: number | null;
  lessons: Lesson[];
}

export interface TaskGroup {
  /** Public task id, or `cluster-<n>-<keywords>` for unmatched runs. */
  id: string;
  taskId: string | null;
  label: string;
  files: string[];
}

export interface SkillDefinition {
  name: string;
  description: string;
  steps: string[];
}

export interface MergedInstruction {
  text: string;
  kind: LessonKind;
  /** Distinct runs behind the instruction (0 when an LLM wrote it). */
  support: number;
}

export interface MergedGroup {
  groupId: string;
  taskId: string | null;
  label: string;
  runs: number;
  pass: number;
  fail: number;
  instructions: MergedInstruction[];
  superseded: { text: string; supersededBy: string }[];
  skills: SkillDefinition[];
  source: "llm" | "deterministic";
}
