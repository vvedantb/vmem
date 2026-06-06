/**
 * Read-time blast-radius helpers. Single Cypher per direction with a
 * bounded variable-length traversal — Neo4j caps default depth to keep
 * the query fast even on large graphs.
 *
 * Default depth = 5. Mirrors GitNexus's choice; gives a meaningful
 * "everyone who could be affected" view without becoming a graph dump.
 */

import type { Driver } from "neo4j-driver";

const DEFAULT_DEPTH = 5;

export interface ImpactNode {
  id: string;
  distance: number;
}

export type ImpactDirection = "upstream" | "downstream";

interface ImpactArgs {
  driver: Driver;
  userId: string;
  codebaseId: string;
  symbolId: string;
  depth?: number;
}

/**
 * Upstream = "who calls me, and who calls them, transitively". Pattern:
 *   (start)<-[:CALLS*1..d]-(caller)
 * The relationship arrow points from caller→callee in our writer, so
 * upstream walks the inbound side.
 */
export async function getUpstreamImpact(
  args: ImpactArgs,
): Promise<ImpactNode[]> {
  return runImpactQuery(args, "upstream");
}

/** Downstream = "what do I call, transitively". Walks outbound CALLS. */
export async function getDownstreamImpact(
  args: ImpactArgs,
): Promise<ImpactNode[]> {
  return runImpactQuery(args, "downstream");
}

async function runImpactQuery(
  { driver, userId, codebaseId, symbolId, depth = DEFAULT_DEPTH }: ImpactArgs,
  direction: ImpactDirection,
): Promise<ImpactNode[]> {
  // Cypher requires the variable-length depth to be a literal, so we
  // interpolate it. Depth is sourced from server code only, never user
  // input — clamp anyway as belt-and-braces.
  const safeDepth = Math.max(1, Math.min(8, Math.floor(depth)));
  const arrow = direction === "upstream" ? "<-[:CALLS*1.." : "-[:CALLS*1..";
  const tail = direction === "upstream" ? "]-" : "]->";
  const cypher = `
    MATCH (start:Function { id: $symbolId, userId: $userId, codebaseId: $codebaseId })
    MATCH path = (start)${arrow}${safeDepth}${tail}(other:Function)
    RETURN DISTINCT other.id AS id, length(path) AS distance
    ORDER BY distance ASC, id ASC
    LIMIT 200
  `;

  const session = driver.session();
  try {
    const result = await session.run(cypher, {
      userId,
      codebaseId,
      symbolId,
    });
    return result.records.map((r) => ({
      id: r.get("id"),
      distance: r.get("distance").toNumber?.() ?? Number(r.get("distance")),
    }));
  } finally {
    await session.close();
  }
}
