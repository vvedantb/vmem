"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { getDriver } from "../../../engine/neo4j/driver";
import {
  listEntitiesWithMentions,
  mergeEntityGroup,
} from "../../../engine/neo4j/memory/entities";
import { withSession } from "../../../engine/neo4j/memory/shared";
import { extractJsonString } from "../../../engine/llm/extractJsonString";
import { objectField, parseUnknownArray } from "../../lib/jsonBoundary";
import { tryUserAndApiKeyByClerkId } from "../../lib/envVars";
import { callJsonChat } from "../../lib/openRouter";
import { normalizeEntityName } from "../../prompts/enrichmentPrompt";

interface EntityRow {
  id: string;
  name: string;
  normalizedName: string;
  type: string;
  mentions: number;
}

/** Groups judged per LLM call. */
const GROUPS_PER_CALL = 30;

/**
 * Containment-based alias candidates: an entity whose normalized name is a
 * contiguous token prefix or suffix of another's ("fable 5" ⊂ "claude
 * fable 5", "gemini" ⊂ "google gemini"). Containment is only a CANDIDATE
 * signal — "react" ⊂ "react query" are different things — so every group
 * goes through LLM adjudication before merging. Returns connected
 * components.
 */
function buildCandidateGroups(entities: EntityRow[]): EntityRow[][] {
  const byNorm = new Map<string, EntityRow>();
  for (const e of entities) byNorm.set(e.normalizedName, e);

  // Union-find over normalized names; inGroup tracks every name that took
  // part in at least one union (roots have no parent entry, so parent
  // membership alone can't tell members from untouched singletons).
  const parent = new Map<string, string>();
  const inGroup = new Set<string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root) ?? root;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
    inGroup.add(a);
    inGroup.add(b);
  };

  for (const e of entities) {
    const words = e.normalizedName.split(" ");
    if (words.length < 2) continue;
    for (let i = 1; i < words.length; i++) {
      for (const cand of [
        words.slice(i).join(" "),
        words.slice(0, i).join(" "),
      ]) {
        if (cand.length >= 4 && byNorm.has(cand)) {
          union(e.normalizedName, cand);
        }
      }
    }
  }

  const groups = new Map<string, EntityRow[]>();
  for (const e of entities) {
    if (!inGroup.has(e.normalizedName)) continue;
    const root = find(e.normalizedName);
    const arr = groups.get(root) ?? [];
    arr.push(e);
    groups.set(root, arr);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

function buildAdjudicationPrompt(groups: EntityRow[][]): string {
  const list = groups
    .map(
      (g, i) =>
        `${String(i)}: ${g
          .map((e) => `"${e.name}" [${e.type}, ${String(e.mentions)} mentions]`)
          .join(" | ")}`,
    )
    .join("\n");
  return `You are an entity resolution system. Respond with ONLY a JSON array, no other text.

Each numbered group below contains entity names that share words. Partition every group into CLUSTERS: names in one cluster all refer to the SAME real-world entity (aliases, shorthands, fuller forms, or version variants of one thing); different clusters are different things. A name that matches nothing else gets its own singleton cluster.

Be conservative — a shared word does NOT make entities the same.

DIFFERENT clusters:
- A product vs another product under the same brand: "TanStack Query" vs "TanStack Start"; "LinkedIn" vs "LinkedIn Learning"; "Mantine" vs "Mantine DataTable".
- A tool vs a related-but-separate tool: "Node" vs "Node Version Manager" (nvm manages Node but is not Node).
- A framework vs one of its features: "Next.js" vs "App Router".
- A library vs its ecosystem/community/sub-package: "Effect" vs "Effect Community" or "effect rpc".
- A company vs one of its products: "Claude" (the assistant) vs "Claude Fable 5" (a specific model).

SAME cluster:
- Aliases and fuller forms of one thing: "Gemini" / "Google Gemini"; "Carti" / "Playboi Carti"; "Apache Flink" / "Flink".
- Version or edition variants of one product: "Fable" / "Fable 5" / "Claude Fable 5"; "Python" / "Python 3"; "Expo SDK 52" / "Expo".

For each cluster of 2+ names, also pick the best canonical display name from among its members (the most complete conventional form).

Groups:
${list}

Respond with ONLY this JSON (names copied EXACTLY; singleton clusters may be omitted):
[{"group": 0, "clusters": [{"names": ["Fable 5", "Claude Fable 5", "Fable"], "canonical": "Claude Fable 5"}]}]`;
}

interface ClusterVerdict {
  group: number;
  clusters: Array<{ names: string[]; canonical?: string }>;
}

function parseClusterVerdicts(
  raw: string,
  groupCount: number,
): ClusterVerdict[] {
  try {
    const parsed: unknown = JSON.parse(extractJsonString(raw));
    if (!Array.isArray(parsed)) return [];
    const out: ClusterVerdict[] = [];
    for (const item of parseUnknownArray(parsed)) {
      if (typeof item !== "object" || item === null) continue;
      const group = objectField(item, "group");
      const clustersRaw = objectField(item, "clusters");
      if (typeof group !== "number" || group < 0 || group >= groupCount)
        continue;
      if (!Array.isArray(clustersRaw)) continue;
      const clusters: Array<{ names: string[]; canonical?: string }> = [];
      for (const c of parseUnknownArray(clustersRaw)) {
        if (typeof c !== "object" || c === null) continue;
        const names = objectField(c, "names");
        const canonical = objectField(c, "canonical");
        if (
          !Array.isArray(names) ||
          !names.every((n): n is string => typeof n === "string")
        )
          continue;
        clusters.push({
          names,
          canonical: typeof canonical === "string" ? canonical : undefined,
        });
      }
      out.push({ group, clusters });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * One-shot entity alias consolidation. Two phases:
 *
 * 1. Deterministic: re-normalize every entity's normalizedName under the
 *    current rule (hyphens = spaces) and merge exact collisions — catches
 *    "Claude Fable-5" vs "Claude Fable 5".
 * 2. LLM-adjudicated: containment candidates ("fable 5" ⊂ "claude fable 5")
 *    are judged in batches; only groups the model confirms as the same
 *    real-world entity merge (survivor = most mentions, display name = the
 *    model's canonical pick when it names a member).
 *
 * Manual-only: npx convex run neo4jActions/migration/entityAliases:mergeEntityAliasesInternal '{"clerkId":"user_..."}'
 * Costs a handful of LLM calls (~30 candidate groups per call). dryRun
 * returns the verdicts without writing.
 */
export const mergeEntityAliasesInternal = internalAction({
  args: {
    clerkId: v.string(),
    dryRun: v.optional(v.boolean()),
    /** Adjudication needs nuance the default cheap model lacks (it merged
     *  Neon Postgres with Heroku Postgres) — pass a stronger model here. */
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const auth = await tryUserAndApiKeyByClerkId(
      ctx,
      args.clerkId,
      "OPENROUTER_API_KEY",
    );
    if (!auth) {
      return { done: true, error: "no OPENROUTER_API_KEY for user" };
    }

    const driver = getDriver();

    // ── Phase 1: re-normalize + merge exact collisions ──
    let entities = await listEntitiesWithMentions(driver, args.clerkId);
    const byNewNorm = new Map<string, EntityRow[]>();
    for (const e of entities) {
      const newNorm = normalizeEntityName(e.name);
      const arr = byNewNorm.get(newNorm) ?? [];
      arr.push(e);
      byNewNorm.set(newNorm, arr);
    }
    let renormMerged = 0;
    for (const [newNorm, group] of byNewNorm) {
      const sorted = [...group].sort((a, b) => b.mentions - a.mentions);
      const survivor = sorted[0];
      if (!survivor) continue;
      if (sorted.length > 1) {
        if (!dryRun) {
          await mergeEntityGroup(driver, {
            survivorId: survivor.id,
            duplicateIds: sorted.slice(1).map((e) => e.id),
            displayName:
              sorted.find((e) => /[A-Z]/.test(e.name))?.name ?? survivor.name,
            normalizedName: newNorm,
          });
        }
        renormMerged += sorted.length - 1;
      } else if (survivor.normalizedName !== newNorm && !dryRun) {
        // Re-key single nodes so future MERGEs under the new rule hit them.
        await withSession(driver, async (session) => {
          await session.run(
            `MATCH (e:Entity {id: $id}) SET e.normalizedName = $newNorm`,
            { id: survivor.id, newNorm },
          );
        });
      }
    }

    // ── Phase 2: LLM-adjudicated alias groups ──
    entities = await listEntitiesWithMentions(driver, args.clerkId);
    const candidateGroups = buildCandidateGroups(entities);

    let aliasMerged = 0;
    const approved: string[] = [];
    for (let i = 0; i < candidateGroups.length; i += GROUPS_PER_CALL) {
      const batch = candidateGroups.slice(i, i + GROUPS_PER_CALL);
      const raw = await callJsonChat(ctx, {
        apiKey: auth.apiKey,
        userId: auth.userId,
        feature: "entity-aliases",
        model: args.model,
        role: "You are an entity resolution system.",
        prompt: buildAdjudicationPrompt(batch),
      });
      if (raw === null) continue;
      for (const verdict of parseClusterVerdicts(raw, batch.length)) {
        const group = batch[verdict.group];
        if (!group) continue;
        const byName = new Map(group.map((e) => [e.name, e]));
        for (const cluster of verdict.clusters) {
          // Names must resolve to distinct members of THIS group — the model
          // cannot merge anything the heuristic didn't already associate.
          const members = [
            ...new Set(
              cluster.names
                .map((n) => byName.get(n))
                .filter((e): e is EntityRow => e !== undefined),
            ),
          ];
          if (members.length < 2) continue;
          const label = members.map((e) => e.name).join(" | ");
          approved.push(label);
          if (dryRun) continue;
          const sorted = [...members].sort((a, b) => b.mentions - a.mentions);
          const survivor = sorted[0];
          if (!survivor) continue;
          const displayName =
            members.find((e) => e.name === cluster.canonical)?.name ??
            survivor.name;
          try {
            await mergeEntityGroup(driver, {
              survivorId: survivor.id,
              duplicateIds: sorted.slice(1).map((e) => e.id),
              displayName,
              normalizedName: normalizeEntityName(displayName),
            });
            aliasMerged += sorted.length - 1;
          } catch (e) {
            // Constraint collision with a node outside the group — skip.
            console.error(`[entity-aliases] merge failed for "${label}":`, e);
          }
        }
      }
    }

    return {
      done: true,
      dryRun,
      renormMerged,
      candidateGroups: candidateGroups.length,
      approved,
      aliasMerged,
    };
  },
});
