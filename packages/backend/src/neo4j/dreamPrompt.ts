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

- **insight** — A distilled pattern, generalization, or learning that holds across ≥3 of these memories. Should add knowledge the user did not explicitly write down.
- **connection** — A non-obvious link between exactly 2 memories that the user might not have noticed. The connection should be specific (not "both about programming").
- **contradiction** — Two or more memories that disagree about the same fact (e.g. "I use VSCode" vs "I switched to Helix"). Be conservative — preferences can change without being contradictions.
- **anomaly** — The seed memory is genuinely an outlier with no useful relationship to its neighbors. Worth flagging so the user can confirm it belongs in this profile.
- **skip** — None of the above apply. The cluster is noisy, mundane, or already obvious. Prefer skip over a weak synthesis.

# Output

Respond with ONLY this JSON, no other text:

{"type": "insight" | "connection" | "contradiction" | "anomaly" | "skip", "title": "short headline", "content": "1–3 sentences stating the synthesis as a fact about the user", "reason": "why this synthesis follows from the source memories", "sourceMemoryIds": ["id1", "id2"], "confidence": 0.0-1.0}

# Rules

- \`title\`: <= 80 chars. First-person where natural ("I prefer ...", "My setup uses ..."). For contradictions, name the conflict ("Editor preference: VSCode vs Helix").
- \`content\`: <= 400 chars. State the synthesis as a fact. For contradictions, lay out both sides.
- \`reason\`: <= 300 chars. Reference the source memory titles or specifics — do not just restate the content.
- \`sourceMemoryIds\`: every id must literally appear in the cluster below. Empty array is invalid for non-skip types.
- \`confidence\`: be strict. 0.9+ only when the synthesis is unambiguous. < 0.6 will be dropped automatically; if you're at all uncertain, prefer \`skip\`.
- For \`skip\`, set confidence to 0 and sourceMemoryIds to []. Title and content can be empty strings.

# Cluster

${memoryBlock}

# Output

Respond with ONLY the JSON object specified above.`;
}

function extractJsonString(raw: string): string {
  let jsonStr = raw.trim();

  // Strip <think>...</think> blocks (Qwen3 and other thinking models)
  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Strip unclosed <think> blocks
  if (jsonStr.startsWith("<think>")) {
    const closeIdx = jsonStr.indexOf("</think>");
    if (closeIdx === -1) {
      jsonStr = jsonStr.slice(7).trim();
    }
  }

  // Strip markdown fences
  if (jsonStr.startsWith("```")) {
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match && match[1]) {
      jsonStr = match[1].trim();
    }
  }

  return jsonStr;
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
