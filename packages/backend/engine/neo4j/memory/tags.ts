/**
 * Tag vocabulary queries (Node-only — imports the Neo4j driver). The pure
 * normalization helpers live in tagNormalize.ts so V8-runtime prompt code
 * can import them without dragging the driver in.
 */
import type { Driver } from "neo4j-driver";
import { neo4jGet, parseNeo4jInt } from "../record";
import { withSession } from "./shared";
import type { TagUsage } from "./tagNormalize";

export { normalizeTags, sanitizeTag } from "./tagNormalize";
export type { TagUsage } from "./tagNormalize";

/**
 * The user's existing tag vocabulary, most-used first. Fed into the
 * enrichment prompt so the LLM reuses established themes instead of minting
 * near-duplicates ("llm" vs "ai-models" vs "ai-model"). Single-use tags are
 * excluded — they are exactly the noise the vocabulary exists to prevent.
 */
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
      name: String(neo4jGet(r, "name") ?? ""),
      uses: parseNeo4jInt(neo4jGet(r, "uses")),
    }));
  });
}
