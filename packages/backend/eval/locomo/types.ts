import type { BenchmarkMemory, RetrievalEvalQuery } from "../corpus";

/** LoCoMo `category` integers from `task_eval/evaluation.py`, not the paper's prose order. */
export const LOCOMO_CATEGORY_TO_TYPE = {
  1: "multi-hop",
  2: "temporal",
  3: "world-knowledge",
  4: "single-hop",
  5: "adversarial",
} as const;

export type LocomoCategory = keyof typeof LOCOMO_CATEGORY_TO_TYPE;
export type LocomoQuestionType =
  (typeof LOCOMO_CATEGORY_TO_TYPE)[LocomoCategory];

export type LocomoSkipReason =
  | "empty-evidence"
  | "unresolved-evidence"
  | "unknown-category";

export interface LoCoMoTurn {
  speaker: string;
  dia_id: string;
  text: string;
  blip_caption?: string;
}

export interface LoCoMoQA {
  question: string;
  answer?: string | number;
  evidence: string[];
  category: number;
  adversarial_answer?: string;
}

export interface LoCoMoConversation {
  speaker_a: string;
  speaker_b: string;
  [key: string]: unknown;
}

export interface LoCoMoItem {
  sample_id: string;
  qa: LoCoMoQA[];
  conversation: LoCoMoConversation;
}

export interface LocomoSkippedQuery {
  sampleId: string;
  question: string;
  category: number;
  reason: LocomoSkipReason;
  evidence: string[];
}

export interface LocomoIrQuery extends RetrievalEvalQuery {
  sampleId: string;
  evidenceIds: string[];
  category: number;
  groundTruth: string;
  needsSynthesis: boolean;
  needsWorldKnowledge: boolean;
  adversarial: boolean;
}

export interface LocomoIrSample {
  sampleId: string;
  memories: BenchmarkMemory[];
  queries: LocomoIrQuery[];
  skipped: LocomoSkippedQuery[];
  nowMs: number;
}
