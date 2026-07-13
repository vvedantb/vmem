import Cypher from "@neo4j/cypher-builder";
import type { Driver } from "neo4j-driver";
import { buildAndRun } from "../cypherHelpers";
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
  const start = new Cypher.NamedNode("start");
  const other = new Cypher.NamedNode("other");
  const path = new Cypher.NamedPathVariable("path");

  const query = new Cypher.Match(
    new Cypher.Pattern(start, {
      labels: ["Function"],
      properties: {
        id: new Cypher.Param(symbolId),
        userId: new Cypher.Param(userId),
        codebaseId: new Cypher.Param(codebaseId),
      },
    }),
  )
    .match(
      new Cypher.Pattern(start)
        .related({
          type: "CALLS",
          direction: direction === "upstream" ? "left" : "right",
          length: { min: 1, max: safeDepth },
        })
        .to(other, { labels: ["Function"] })
        .assignTo(path),
    )
    .return([other.property("id"), "id"], [Cypher.length(path), "distance"])
    .distinct()
    .orderBy([Cypher.length(path), "ASC"], [other.property("id"), "ASC"])
    .limit(200);

  const session = driver.session();
  try {
    const result = await buildAndRun(session, query);
    return result.records.map(parseImpactRecord);
  } finally {
    await session.close();
  }
}
