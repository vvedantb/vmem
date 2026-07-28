"use node";

import type { Driver } from "neo4j-driver";
import { getMemory } from "../../../engine/neo4j/memory/crud";
import {
  createProposedDelete,
  createProposedUpdate,
} from "../../../engine/neo4j/memory/proposals";
import type { MemoryReadScope } from "../../../engine/neo4j/memory/scope";
import { getMemoryForTeam } from "../../../engine/neo4j/memory/team";
import type { ProposedUpdateNode } from "../../../engine/neo4j/memory/types";
import type { UpdateDecision } from "../../prompts/v2Prompt";

// same scope as retrieval, or teammate targets look missing and get dropped
// personal stays by userId so legacy memories with no profile still resolve
async function memoryExists(
  driver: Driver,
  scope: MemoryReadScope,
  memoryId: string,
  eventLabel: "UPDATE" | "DELETE",
  logPrefix?: string,
): Promise<boolean> {
  const target =
    scope.kind === "team"
      ? await getMemoryForTeam(driver, scope.profileId, memoryId)
      : await getMemory(driver, scope.userId, memoryId);
  if (target) return true;
  if (logPrefix) {
    console.warn(
      `${logPrefix} ${eventLabel} target ${memoryId} not found, skipping`,
    );
  }
  return false;
}

export async function applyFactUpdateOrDelete(
  driver: Driver,
  params: {
    scope: MemoryReadScope;
    factText: string;
    decision: UpdateDecision;
    buildUpdateReason: (args: {
      factText: string;
      decision: UpdateDecision;
    }) => string;
    buildDeleteReason: (args: {
      factText: string;
      decision: UpdateDecision;
    }) => string;
    logPrefix?: string;
    onProposal?: (proposal: ProposedUpdateNode) => void;
  },
): Promise<"update" | "delete" | "none" | "missing-target"> {
  const {
    scope,
    factText,
    decision,
    buildUpdateReason,
    buildDeleteReason,
    logPrefix,
    onProposal,
  } = params;

  if (decision.event === "UPDATE") {
    const memoryId = decision.id;
    const proposedContent = decision.text;
    if (!memoryId || !proposedContent) return "none";

    if (!(await memoryExists(driver, scope, memoryId, "UPDATE", logPrefix))) {
      return "missing-target";
    }

    const proposal = await createProposedUpdate(driver, {
      memoryId,
      proposedContent,
      reason: buildUpdateReason({ factText, decision }),
    });
    onProposal?.(proposal);
    return "update";
  }

  if (decision.event === "DELETE") {
    const memoryId = decision.id;
    if (!memoryId) return "none";

    if (!(await memoryExists(driver, scope, memoryId, "DELETE", logPrefix))) {
      return "missing-target";
    }

    const proposal = await createProposedDelete(driver, {
      memoryId,
      reason: buildDeleteReason({ factText, decision }),
    });
    onProposal?.(proposal);
    return "delete";
  }

  return "none";
}
