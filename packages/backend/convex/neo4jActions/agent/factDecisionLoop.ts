"use node";

import type { ActionCtx } from "../../_generated/server";
import { retrieveMemories } from "../../../engine/neo4j/memory/retrieve";
import type {
  MemoryReadScope,
  ScopeKind,
} from "../../../engine/neo4j/memory/scope";
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
  // personal or team ownership of the profile being written to
  graphScope?: ScopeKind;
  retrieveWithProfileId?: boolean;
  excludeMemoryIds?: string[];
  logPrefix: string;
  bestEffortPerFact?: boolean;
}

// team writes must read the whole shared profile or every member re adds the same fact
// personal scope would also pull in the callers legacy memories with no profile
export function retrievalScope(
  opts: Pick<
    FactDecisionLoopOptions,
    "clerkId" | "profileId" | "graphScope" | "retrieveWithProfileId"
  >,
): MemoryReadScope {
  if (opts.graphScope === "team" && opts.profileId !== undefined) {
    return { kind: "team", profileId: opts.profileId };
  }
  if (opts.retrieveWithProfileId && opts.profileId !== undefined) {
    return {
      kind: "personal",
      userId: opts.clerkId,
      profileId: opts.profileId,
    };
  }
  return { kind: "personal", userId: opts.clerkId };
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
): Promise<void> {
  const driver = getDriver();

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

      const retrieved = await retrieveMemories(driver, {
        scope: retrievalScope(opts),
        query: fact.text,
        queryEmbedding: factEmbedding,
        limit: RETRIEVAL_TOP_K,
      });

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
        return;
      }

      await apply({ factIndex, factText: fact.text, decision });
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
}
