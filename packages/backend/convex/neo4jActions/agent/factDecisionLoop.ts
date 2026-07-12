"use node";

import type { ActionCtx } from "../../_generated/server";
import { retrieveMemories } from "../../../engine/neo4j/memory/retrieve";
import { getDriver } from "../../../engine/neo4j/driver";
import { bestEffortEmbedOneWithAuth } from "../../lib/openRouter/bestEffortEmbed";
import type { ExtractedFact, UpdateDecision } from "../../prompts/v2Prompt";
import {
  decideFactUpdate,
  toDecisionCandidates,
  RETRIEVAL_TOP_K,
  type AgentAuth,
} from "./shared";

export interface FactDecisionLoopOptions {
  ctx: ActionCtx;
  auth: AgentAuth;
  clerkId: string;
  profileId?: string;
  /** When true, pass profileId to retrieveMemories; when false/omit, omit it. */
  retrieveWithProfileId?: boolean;
  excludeMemoryIds?: string[];
  /** Prefix for embed failure logs, e.g. "[v2]" or "[agent]" */
  logPrefix: string;
  /** When true, wrap each fact in try/catch and continue (v2 behavior) */
  bestEffortPerFact?: boolean;
}

export interface FactDecisionOutcome {
  factIndex: number;
  factText: string;
  decision: UpdateDecision;
}

export type ApplyFactDecision = (outcome: FactDecisionOutcome) => Promise<void>;

export async function runFactDecisionLoop(
  opts: FactDecisionLoopOptions,
  facts: ExtractedFact[],
  apply: ApplyFactDecision,
): Promise<{ processed: number; skipped: number }> {
  const driver = getDriver();
  let processed = 0;
  let skipped = 0;

  for (let factIndex = 0; factIndex < facts.length; factIndex++) {
    const fact = facts[factIndex];
    if (!fact) {
      continue;
    }

    const runOne = async (): Promise<void> => {
      const factEmbedding = await bestEffortEmbedOneWithAuth({
        ctx: opts.ctx,
        auth: { userId: opts.auth.userId, apiKey: opts.auth.apiKey },
        profileId: opts.profileId,
        feature: "fact-extraction",
        text: fact.text,
        failureLog: `${opts.logPrefix} Fact embedding failed for "${fact.text.slice(0, 40)}..."`,
      });

      const retrieveBase = {
        userId: opts.clerkId,
        query: fact.text,
        queryEmbedding: factEmbedding,
        limit: RETRIEVAL_TOP_K,
      };

      const retrieveOpts =
        opts.retrieveWithProfileId && opts.profileId !== undefined
          ? { ...retrieveBase, profileId: opts.profileId }
          : retrieveBase;

      const retrieved = await retrieveMemories(driver, retrieveOpts);

      let filtered = retrieved;
      if (opts.excludeMemoryIds && opts.excludeMemoryIds.length > 0) {
        const excludeSet = new Set(opts.excludeMemoryIds);
        filtered = retrieved.filter((m) => !excludeSet.has(m.id));
      }

      const decision = await decideFactUpdate(
        opts.ctx,
        opts.auth,
        opts.profileId,
        fact.text,
        toDecisionCandidates(filtered),
      );

      if (!decision) {
        if (opts.bestEffortPerFact) {
          console.warn(
            `${opts.logPrefix} Invalid decision response for fact ${String(factIndex)}`,
          );
        }
        skipped += 1;
        return;
      }

      await apply({ factIndex, factText: fact.text, decision });
      processed += 1;
    };

    if (opts.bestEffortPerFact) {
      try {
        await runOne();
      } catch (err) {
        console.error(
          `${opts.logPrefix} Fact ${String(factIndex)} pipeline failed:`,
          err,
        );
      }
    } else {
      await runOne();
    }
  }

  return { processed, skipped };
}
