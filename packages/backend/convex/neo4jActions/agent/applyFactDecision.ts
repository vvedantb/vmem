"use node";

import type { Driver } from "neo4j-driver";
import { getMemory } from "../../../engine/neo4j/memory/crud";
import {
  createProposedDelete,
  createProposedUpdate,
} from "../../../engine/neo4j/memory/proposals";
import type { ProposedUpdateNode } from "../../../engine/neo4j/memory/types";
import type { UpdateDecision } from "../../prompts/v2Prompt";

async function memoryExists(
  driver: Driver,
  clerkId: string,
  memoryId: string,
  eventLabel: "UPDATE" | "DELETE",
  logPrefix?: string,
): Promise<boolean> {
  const target = await getMemory(driver, clerkId, memoryId);
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
    clerkId: string;
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
    clerkId,
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

    if (!(await memoryExists(driver, clerkId, memoryId, "UPDATE", logPrefix))) {
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

    if (!(await memoryExists(driver, clerkId, memoryId, "DELETE", logPrefix))) {
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
