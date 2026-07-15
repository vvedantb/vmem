import type { Driver } from "neo4j-driver";
import { parseImpactRecord } from "./mappers";

const DEFAULT_DEPTH = 5;
const MAX_DEPTH = 8;

export interface ImpactNode {
  id: string;
  distance: number;
}

interface ImpactArgs {
  driver: Driver;
  userId: string;
  codebaseId: string;
  symbolId: string;
  depth?: number;
}

export async function getUpstreamImpact(
  args: ImpactArgs,
): Promise<ImpactNode[]> {
  return runImpactQuery(args, "upstream");
}

export async function getDownstreamImpact(
  args: ImpactArgs,
): Promise<ImpactNode[]> {
  return runImpactQuery(args, "downstream");
}

async function runImpactQuery(
  { driver, userId, codebaseId, symbolId, depth = DEFAULT_DEPTH }: ImpactArgs,
  direction: "upstream" | "downstream",
): Promise<ImpactNode[]> {
  const safeDepth = Math.max(1, Math.min(MAX_DEPTH, Math.floor(depth)));
  const rel =
    direction === "upstream"
      ? `<-[:CALLS*1..${safeDepth}]-`
      : `-[:CALLS*1..${safeDepth}]->`;

  const result = await driver.executeQuery(
    `
    MATCH (start:Function { id: $symbolId, userId: $userId, codebaseId: $codebaseId })
    MATCH path = (start)${rel}(other:Function)
    RETURN other.id AS id, length(path) AS distance
    ORDER BY distance ASC, id ASC
    LIMIT 200
    `,
    { symbolId, userId, codebaseId },
  );
  const seen = new Set<string>();
  const out: ImpactNode[] = [];
  for (const record of result.records) {
    const node = parseImpactRecord(record);
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}
