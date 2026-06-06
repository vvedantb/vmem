import { extractJsonString } from "../llm/extractJsonString";

/**
 * Dream Mode V2 — synthesis prompt builder + parser.
 *
 * Honcho-Deriver-style background reasoning. Given a cluster of memories
 * (one anomaly + its 1-hop graph neighborhood), the LLM emits a single
 * synthesis proposal of one of four kinds:
 *
 *   - insight       — distilled pattern across ≥3 memories
 *   - connection    — non-obvious link between 2 memories
 *   - contradiction — 2+ memories disagree about a fact
 *   - anomaly       — one memory unlike anything else in the cluster
 *
 * The model is also free to emit `type: "skip"` when the cluster looks
 * like genuine noise or mundane co-occurrence — we'd rather false-negative
 * than spam the proposals queue.
 *
 * Parsers tolerate `<think>...</think>` blocks (Qwen3 thinking models)
 * and markdown code fences. Errors return null; the orchestrator skips
 * the cluster.
 */

const MAX_CONTENT_LENGTH = 1200;

export type SynthesisType =
  | "insight"
  | "connection"
  | "contradiction"
  | "anomaly"
  | "skip";

const VALID_TYPES: readonly SynthesisType[] = [
  "insight",
  "connection",
  "contradiction",
  "anomaly",
  "skip",
];

export interface DreamClusterMember {
  id: string;
  title: string;
  content: string;
  tags: string[];
  /**
   * The anomaly seed is rendered first in the prompt so the LLM has a
   * focal point — `related` and `shared-entity` neighbors come after.
   */
  relation: "anomaly" | "related" | "shared-entity";
}

export interface ParsedSynthesis {
  type: SynthesisType;
  title: string;
  content: string;
  reason: string;
  /** Memory ids the synthesis derives from. Always a subset of the cluster ids. */
  sourceMemoryIds: string[];
  /** 0–1. Caller drops anything below the confidence floor (0.6). */
  confidence: number;
}

function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(" ", maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen);
}

/**
 * Build the user prompt for one cluster. Cluster size cap is enforced by
 * the caller (`fetchAnomalyCluster.maxClusterSize`); this just renders.
 */
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

The first memory in the cluster is the "anomaly seed" — it scored high on surprisal (semantically distant from its neighbors). The remaining memories are its 1-hop graph neighborhood (memories linked via RELATES_TO, or that share a named entity via MENTIONS).

Pick ONE of these synthesis kinds, or skip:

- **insight** — A distilled pattern, generalization, or learning that holds across ≥3 of these memories. Must add NEW knowledge the user did not explicitly write down. Becomes a permanent memory on accept.
- **connection** — A non-obvious link between exactly 2 memories that the user might not have noticed. The connection should be specific (not "both about programming"). Becomes a permanent memory on accept.
- **contradiction** — Two or more memories that disagree about the same fact (e.g. "I use VSCode" vs "I switched to Helix"). Be conservative — preferences can change without being contradictions. The user resolves the conflict manually; this is a flag, not new content.
- **anomaly** — The seed memory is genuinely an outlier with no useful relationship to its neighbors. This is a FLAG (not new content) — the user reviews whether the memory belongs in this profile. Use sparingly: only when the seed has no plausible link to its neighbors.
- **skip** — None of the above apply. The cluster is noisy, mundane, or already obvious. Prefer skip over a weak synthesis.

# Output

Respond with ONLY this JSON, no other text:

{"type": "insight" | "connection" | "contradiction" | "anomaly" | "skip", "title": "short headline", "content": "1–3 sentences stating the synthesis", "reason": "why this synthesis follows from the source memories", "sourceMemoryIds": ["id1", "id2"], "confidence": 0.0-1.0}

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

function isSynthesisType(value: string): value is SynthesisType {
  return (VALID_TYPES as readonly string[]).includes(value);
}

/**
 * Parse the LLM response. Returns null when the JSON is malformed,
 * required fields are missing, or any sourceMemoryId isn't in the
 * provided cluster (we never let the model invent ids).
 */
export function parseDreamSynthesisResponse(
  raw: string,
  clusterIds: string[],
): ParsedSynthesis | null {
  try {
    const jsonStr = extractJsonString(raw);
    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null) return null;

    const typeRaw = Reflect.get(parsed, "type");
    const titleRaw = Reflect.get(parsed, "title");
    const contentRaw = Reflect.get(parsed, "content");
    const reasonRaw = Reflect.get(parsed, "reason");
    const sourceIdsRaw = Reflect.get(parsed, "sourceMemoryIds");
    const confidenceRaw = Reflect.get(parsed, "confidence");

    if (typeof typeRaw !== "string" || !isSynthesisType(typeRaw)) return null;

    const title = typeof titleRaw === "string" ? titleRaw.slice(0, 200) : "";
    const content =
      typeof contentRaw === "string" ? contentRaw.slice(0, 800) : "";
    const reason = typeof reasonRaw === "string" ? reasonRaw.slice(0, 600) : "";

    let confidence = 0;
    if (typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)) {
      confidence = Math.max(0, Math.min(1, confidenceRaw));
    }

    const validIds = new Set<string>(clusterIds);
    let sourceMemoryIds: string[] = [];
    if (Array.isArray(sourceIdsRaw)) {
      const seen = new Set<string>();
      for (const id of sourceIdsRaw) {
        if (typeof id !== "string") continue;
        if (!validIds.has(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        sourceMemoryIds.push(id);
      }
    }

    if (typeRaw === "skip") {
      return {
        type: "skip",
        title: "",
        content: "",
        reason,
        sourceMemoryIds: [],
        confidence: 0,
      };
    }

    // Non-skip kinds need at least one source and non-empty title/content.
    if (sourceMemoryIds.length === 0) return null;
    if (title.trim().length === 0 || content.trim().length === 0) return null;

    // Connections describe links between exactly 2 memories — anything
    // else is either an insight or a contradiction. We don't enforce the
    // count strictly (the LLM might pick 3 sources and call it a
    // connection), but we cap at the cluster size.
    if (sourceMemoryIds.length > clusterIds.length) {
      sourceMemoryIds = sourceMemoryIds.slice(0, clusterIds.length);
    }

    return {
      type: typeRaw,
      title,
      content,
      reason,
      sourceMemoryIds,
      confidence,
    };
  } catch {
    console.error("[dream] Failed to parse LLM synthesis response:", raw);
    return null;
  }
}
