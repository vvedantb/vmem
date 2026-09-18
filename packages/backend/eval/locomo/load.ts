import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { LoCoMoItem } from "./types";

export const LOCOMO10_URL =
  "https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json";

const qaSchema = z
  .object({
    question: z.string(),
    answer: z.union([z.string(), z.number()]).optional(),
    evidence: z.array(z.string()).optional().default([]),
    category: z.number(),
    adversarial_answer: z.string().optional(),
  })
  .passthrough();

const itemSchema = z
  .object({
    sample_id: z.string(),
    qa: z.array(qaSchema),
    conversation: z
      .object({
        speaker_a: z.string(),
        speaker_b: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

const datasetSchema = z.array(itemSchema);

export function defaultLocomoCachePath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    ".cache",
    "locomo10.json",
  );
}

export interface LoadLocomo10Options {
  cachePath?: string;
  url?: string;
  fetchImpl?: typeof fetch;
}

function asLocomoItems(parsed: z.infer<typeof datasetSchema>): LoCoMoItem[] {
  return parsed.map((item) => ({
    sample_id: item.sample_id,
    qa: item.qa.map((qa) => ({
      question: qa.question,
      answer: qa.answer ?? "",
      evidence: qa.evidence,
      category: qa.category,
      ...(qa.adversarial_answer === undefined
        ? {}
        : { adversarial_answer: qa.adversarial_answer }),
    })),
    conversation: {
      ...item.conversation,
      speaker_a: item.conversation.speaker_a,
      speaker_b: item.conversation.speaker_b,
    },
  }));
}

function readCached(cachePath: string): LoCoMoItem[] | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(cachePath, "utf8"));
    return asLocomoItems(datasetSchema.parse(raw));
  } catch {
    return undefined;
  }
}

export async function loadLocomo10(
  options: LoadLocomo10Options = {},
): Promise<LoCoMoItem[]> {
  const cachePath = options.cachePath ?? defaultLocomoCachePath();
  const cached = readCached(cachePath);
  if (cached !== undefined) return cached;

  const url = options.url ?? LOCOMO10_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `LoCoMo download failed: ${String(response.status)} ${response.statusText} (${url})`,
    );
  }
  const text = await response.text();
  const raw: unknown = JSON.parse(text);
  const parsed = datasetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `LoCoMo JSON failed schema checks (${String(parsed.error.issues.length)} issues). First: ${parsed.error.issues[0]?.message ?? "unknown"} at ${parsed.error.issues[0]?.path.join(".") ?? "?"}`,
    );
  }
  const items = asLocomoItems(parsed.data);
  mkdirSync(dirname(cachePath), { recursive: true });
  const tmpPath = `${cachePath}.tmp`;
  writeFileSync(tmpPath, text, "utf8");
  renameSync(tmpPath, cachePath);
  return items;
}
