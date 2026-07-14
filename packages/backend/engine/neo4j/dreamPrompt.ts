import { z } from "zod";
import { parseJsonString } from "../llm/extractJsonString";

const MAX_CONTENT_LENGTH = 1200;

const synthesisTypeSchema = z.enum([
  "insight",
  "connection",
  "contradiction",
  "anomaly",
  "skip",
]);
export type SynthesisType = z.infer<typeof synthesisTypeSchema>;

export interface DreamClusterMember {
  id: string;
  title: string;
  content: string;
  tags: string[];
  relation: "anomaly" | "related" | "shared-entity" | "semantic";
}

export interface ConfidenceAdjustment {
  memoryId: string;
  newConfidence: number;
  reason: string;
}

export interface ParsedSynthesis {
  type: SynthesisType;
  title: string;
  content: string;
  reason: string;
  sourceMemoryIds: string[];
  confidence: number;
  confidenceAdjustments: ConfidenceAdjustment[];
}

function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(" ", maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen);
}

function clamp01(value: number | undefined): number {
  return value !== undefined ? Math.max(0, Math.min(1, value)) : 0;
}

export function filterValidIds(
  ids: readonly unknown[] | undefined,
  validIds: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids ?? []) {
    if (typeof id !== "string") continue;
    if (!validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function buildDreamSynthesisPrompt(
  cluster: DreamClusterMember[],
): string {
  const memoryBlock = cluster
    .map((m, i) => {
      const tagLine = m.tags.length > 0 ? `Tags: ${m.tags.join(", ")}` : "";
      const truncated = truncateAtWord(m.content, MAX_CONTENT_LENGTH);
      return [
        `[${String(i + 1)}] id=${m.id}  (${m.relation})`,
        `Title: ${m.title}`,
        tagLine,
        `Content: ${truncated}`,
      ]
        .filter((line) => line.length > 0)
        .join("\n");
    })
    .join("\n\n");

  return `You are a memory-graph synthesis system. Given a cluster of memories about a single user, decide whether there is a meaningful synthesis to surface, and if so, produce ONE proposal. Respond with ONLY a JSON object — no explanation, no thinking, no markdown.

# Task

The first memory in the cluster is the "anomaly seed" — it scored high on surprisal (semantically distant from its neighbors). The remaining memories are its 1-hop graph neighborhood (memories linked via RELATES_TO, or that share a named entity via MENTIONS), plus — when the seed had few graph links — its closest semantic neighbours from the whole corpus, marked (semantic). Semantic neighbours may be much older than the seed; a connection across time is exactly the kind worth surfacing.

Pick ONE of these synthesis kinds, or skip:

- **insight** — A distilled pattern, generalization, or learning that holds across ≥3 of these memories. Must add NEW knowledge the user did not explicitly write down. Becomes a permanent memory on accept.
- **connection** — A non-obvious link between exactly 2 memories that the user might not have noticed. The connection should be specific (not "both about programming"). Becomes a permanent memory on accept.
- **contradiction** — Two or more memories that disagree about the same fact (e.g. "I use VSCode" vs "I switched to Helix"). Be conservative — preferences can change without being contradictions. The user resolves the conflict manually; this is a flag, not new content.
- **anomaly** — The seed memory is genuinely an outlier with no useful relationship to its neighbors. This is a FLAG (not new content) — the user reviews whether the memory belongs in this profile. Use sparingly: only when the seed has no plausible link to its neighbors.
- **skip** — None of the above apply. The cluster is noisy, mundane, or already obvious. Prefer skip over a weak synthesis.

# Output

Respond with ONLY this JSON, no other text:

{"type": "insight" | "connection" | "contradiction" | "anomaly" | "skip", "title": "short headline", "content": "1–3 sentences stating the synthesis", "reason": "why this synthesis follows from the source memories", "sourceMemoryIds": ["id1", "id2"], "confidence": 0.0-1.0, "confidenceAdjustments": [{"memoryId": "id", "newConfidence": 0.0-1.0, "reason": "short"}]}

\`confidenceAdjustments\` is optional reweighting, independent of the synthesis (you may emit it even with type "skip"). Use it ONLY when the cluster gives clear evidence a memory's stored confidence is wrong: several independent memories corroborating a fact → nudge it up; a memory contradicted or clearly outdated by more recent ones → nudge it down. Keep changes small (within ±0.2), reference only ids from the cluster, and omit the field entirely (or use []) when there is no clear evidence — most clusters need no adjustments.

# Hard rules — content quality

For \`insight\` and \`connection\` (becomes a memory on accept):

  ❌ NEVER refer to the cluster as "memories" or use phrases like "the memory about X", "this memory", "the note on Y", "all other memories", "across these memories". The reader will not see the cluster — they will see ONLY your synthesis as a standalone fact.
  ❌ NEVER use meta-descriptive words: "outlier", "unlike others", "stands out", "different from", "highly specific", "more technical than", "is generic compared to". These describe the cluster, not the user.
  ❌ NEVER restate or summarize what each memory contains. The synthesis must be a NEW statement that follows FROM the cluster, not ABOUT the cluster.
  ✅ State the synthesis as a self-contained fact about the user, their preferences, their work, or the world.
  ✅ Use first-person where natural ("I prefer ...", "My setup uses ...").

For \`contradiction\`: lay out both sides factually ("Earlier I noted X; more recently I noted Y").
For \`anomaly\`: a one-sentence flag is fine — this is the only kind where mentioning the seed memory is acceptable, since the user is reviewing whether it belongs.

# Examples

INSIGHT — bad:  "The memory about Cloudflare's compute architecture is highly specific and technical, while all other memories are generic references to X."
INSIGHT — good: "I gravitate toward edge-compute platforms — Cloudflare Workers and similar V8-isolate runtimes appear repeatedly in my reading."

CONNECTION — bad: "The Helix note and the Cloudflare note are both about technical topics."
CONNECTION — good: "Both Helix and Cloudflare Workers reflect a preference for performance-first tooling that minimizes overhead."

ANOMALY — acceptable: "The Cloudflare technical note doesn't fit alongside the cluster of personal-life memories — confirm whether it belongs in this profile."

# Field rules

- \`title\`: <= 80 chars. First-person where natural for insight/connection; name the conflict for contradiction; describe the unusual seed for anomaly.
- \`content\`: <= 400 chars. Follow the hard rules above per type.
- \`reason\`: <= 300 chars. Reference the source memory titles or specifics — do not just restate the content. Reason is shown to the user; it CAN refer to the cluster (e.g. "Both [title A] and [title B] mention V8 isolates").
- \`sourceMemoryIds\`: every id must literally appear in the cluster below. Empty array is invalid for non-skip types.
- \`confidence\`: be strict. 0.9+ only when the synthesis is unambiguous. < 0.6 will be dropped automatically; if you're at all uncertain, prefer \`skip\`.
- For \`skip\`, set confidence to 0 and sourceMemoryIds to []. Title and content can be empty strings.

# Cluster

${memoryBlock}

# Output

Respond with ONLY the JSON object specified above.`;
}

const adjustmentSchema = z.object({
  memoryId: z.string(),
  newConfidence: z.number().finite(),
  reason: z.string().optional(),
});

const synthesisResponseSchema = z.object({
  type: synthesisTypeSchema,
  title: z.string().optional(),
  content: z.string().optional(),
  reason: z.string().optional(),
  sourceMemoryIds: z.array(z.unknown()).optional(),
  confidence: z.number().finite().optional(),
  confidenceAdjustments: z.array(z.unknown()).optional(),
});

function parseConfidenceAdjustments(
  raw: readonly unknown[] | undefined,
  validIds: ReadonlySet<string>,
): ConfidenceAdjustment[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const adjustments: ConfidenceAdjustment[] = [];
  for (const item of raw) {
    const entry = adjustmentSchema.safeParse(item);
    if (!entry.success) continue;
    if (!validIds.has(entry.data.memoryId) || seen.has(entry.data.memoryId)) {
      continue;
    }
    seen.add(entry.data.memoryId);
    adjustments.push({
      memoryId: entry.data.memoryId,
      newConfidence: Math.max(0.05, Math.min(1, entry.data.newConfidence)),
      reason: entry.data.reason?.slice(0, 300) ?? "",
    });
  }
  return adjustments;
}

export function parseDreamSynthesisResponse(
  raw: string,
  clusterIds: string[],
): ParsedSynthesis | null {
  const data = parseJsonString(raw, synthesisResponseSchema);
  if (!data) {
    console.error("[dream] Failed to parse LLM synthesis response:", raw);
    return null;
  }

  const type = data.type;
  const title = (data.title ?? "").slice(0, 200);
  const content = (data.content ?? "").slice(0, 800);
  const reason = (data.reason ?? "").slice(0, 600);
  const confidence = clamp01(data.confidence);

  const validIds = new Set<string>(clusterIds);
  const confidenceAdjustments = parseConfidenceAdjustments(
    data.confidenceAdjustments,
    validIds,
  );

  if (type === "skip") {
    return {
      type: "skip",
      title: "",
      content: "",
      reason,
      sourceMemoryIds: [],
      confidence: 0,
      confidenceAdjustments,
    };
  }

  const sourceMemoryIds = filterValidIds(data.sourceMemoryIds, validIds);

  if (sourceMemoryIds.length === 0) return null;
  if (title.trim().length === 0 || content.trim().length === 0) return null;

  return {
    type,
    title,
    content,
    reason,
    sourceMemoryIds,
    confidence,
    confidenceAdjustments,
  };
}

export interface MergeClusterMember {
  id: string;
  title: string;
  content: string;
}

export interface ParsedMerge {
  title: string;
  content: string;
  sourceMemoryIds: string[];
  confidence: number;
}

export function buildMergeSynthesisPrompt(
  cluster: MergeClusterMember[],
): string {
  const memoryBlock = cluster
    .map((m, i) => {
      const truncated = truncateAtWord(m.content, MAX_CONTENT_LENGTH);
      return [
        `[${String(i + 1)}] id=${m.id}`,
        `Title: ${m.title}`,
        `Content: ${truncated}`,
      ].join("\n");
    })
    .join("\n\n");

  return `You are a memory reconsolidation system. The memories below are semantically near-identical fragments from a single user's memory store. Decide whether they are redundant records of the SAME fact/topic that should be consolidated into one memory. Respond with ONLY a JSON object — no explanation, no thinking, no markdown.

# Task

- **merge** — The memories redundantly describe the same fact, preference, or event (e.g. the same article saved twice, the same preference phrased two ways). Produce ONE consolidated memory that preserves EVERY distinct fact from the sources — merging must lose no information. The sources will be retired and replaced by your consolidation.
- **skip** — The memories are merely similar, not redundant: each adds standalone value (different events, different facts about the same topic, evolving states over time). Prefer skip whenever you are unsure — a wrong merge destroys nuance.

# Output

Respond with ONLY this JSON, no other text:

{"type": "merge" | "skip", "title": "title for the consolidated memory", "content": "the consolidated memory", "sourceMemoryIds": ["id1", "id2"], "confidence": 0.0-1.0}

# Field rules

- \`title\`: <= 80 chars, first-person where natural.
- \`content\`: <= 600 chars. A self-contained statement covering every distinct fact from the sources. Never refer to "the memories" or describe the merge — the reader sees only this text.
- \`sourceMemoryIds\`: the ids being consolidated — at least 2, every id must literally appear in the cluster below. You may merge a subset and leave the rest alone.
- \`confidence\`: be strict. < 0.6 is dropped automatically. 0.9+ only for unmistakable duplicates.
- For \`skip\`: set confidence to 0 and sourceMemoryIds to []. Title and content can be empty strings.

# Cluster

${memoryBlock}

# Output

Respond with ONLY the JSON object specified above.`;
}

const mergeResponseSchema = z.object({
  type: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  sourceMemoryIds: z.array(z.unknown()).optional(),
  confidence: z.number().finite().optional(),
});

export function parseMergeSynthesisResponse(
  raw: string,
  clusterIds: string[],
): ParsedMerge | null {
  const data = parseJsonString(raw, mergeResponseSchema);
  if (!data) {
    console.error("[dream] Failed to parse LLM merge response:", raw);
    return null;
  }
  if (data.type !== "merge") return null;

  const title = (data.title ?? "").slice(0, 200);
  const content = (data.content ?? "").slice(0, 800);
  if (title.trim().length === 0 || content.trim().length === 0) return null;

  const validIds = new Set<string>(clusterIds);
  const sourceMemoryIds = filterValidIds(data.sourceMemoryIds, validIds);
  if (sourceMemoryIds.length < 2) return null;

  const confidence = clamp01(data.confidence);

  return { title, content, sourceMemoryIds, confidence };
}
