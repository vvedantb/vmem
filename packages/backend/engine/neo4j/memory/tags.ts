import type { Driver } from "neo4j-driver";
import { neo4jGet, neo4jString, parseNeo4jInt } from "../record";
import { withSession } from "./shared";
import type { TagUsage } from "./tagNormalize";

export async function getTopTags(
  driver: Driver,
  userId: string,
  limit: number = 50,
): Promise<TagUsage[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (t:Tag)<-[:TAGGED_WITH]-(m:Memory {userId: $userId})
       WITH t.name AS name, count(m) AS uses
       WHERE uses >= 2
       RETURN name, uses
       ORDER BY uses DESC, name ASC
       LIMIT toInteger($limit)`,
      { userId, limit: Math.trunc(limit) },
    );
    return result.records.map((r) => ({
      name: neo4jString(r, "name"),
      uses: parseNeo4jInt(neo4jGet(r, "uses")),
    }));
  });
}
