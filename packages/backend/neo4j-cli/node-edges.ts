/**
 * One-off read-only diagnostic: edge breakdown for a single memory matched by
 * title substring. Aggregates + titles only.
 */
import { z } from "zod";
import { getDriver, closeDriver } from "../engine/neo4j/driver";
import { neo4jField } from "../engine/neo4j/record";

const coerceStringArraySchema = z.array(z.coerce.string());

const TITLE_PART = process.argv[2] ?? "modern-cpp-features";

async function main() {
  const driver = getDriver();
  const session = driver.session();
  try {
    const found = await session.run(
      `MATCH (m:Memory) WHERE m.title CONTAINS $part
       RETURN m.id AS id, m.userId AS userId, m.title AS title LIMIT 3`,
      { part: TITLE_PART },
    );
    if (found.records.length === 0) {
      console.log("no memory found");
      return;
    }
    for (const rec of found.records) {
      const id = String(rec.get("id"));
      const userId = String(rec.get("userId"));
      console.log(`\n#### ${String(rec.get("title"))} (${id})`);

      const counts = await session.run(
        `MATCH (m:Memory {id: $id})
         OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
         WITH m, collect(t.name) AS tags
         OPTIONAL MATCH (m)-[r:RELATES_TO]-(o:Memory)
         WITH m, tags, count(DISTINCT o) AS relatesCount,
              collect(DISTINCT r.reason)[..5] AS reasons
         OPTIONAL MATCH (m)-[:MENTIONS]->(e)
         RETURN tags, relatesCount, reasons, count(DISTINCT e) AS entityCount`,
        { id },
      );
      const c = counts.records[0];
      if (!c) continue;
      const tags = neo4jField(c, "tags", coerceStringArraySchema);
      console.log(`tags (${String(tags.length)}): ${tags.join(", ")}`);
      console.log(
        `RELATES_TO neighbours: ${String(c.get("relatesCount"))}  reasons: ${JSON.stringify(c.get("reasons"))}`,
      );
      console.log(`MENTIONS entities: ${String(c.get("entityCount"))}`);

      // For each tag: how many OTHER memories share it → tag-edge fan-out
      const fanout = await session.run(
        `MATCH (m:Memory {id: $id})-[:TAGGED_WITH]->(t:Tag)
         MATCH (t)<-[:TAGGED_WITH]-(o:Memory {userId: $userId})
         WHERE o.id <> $id
         WITH t.name AS tag, count(o) AS others
         RETURN tag, others ORDER BY others DESC`,
        { id, userId },
      );
      console.log("tag fan-out (other memories sharing each tag):");
      for (const r of fanout.records) {
        console.log(
          `  ${String(r.get("others")).padStart(5)}  ${String(r.get("tag"))}`,
        );
      }

      // Distribution of RELATES_TO across the whole account for context
      const dist = await session.run(
        `MATCH (mm:Memory {userId: $userId})
         OPTIONAL MATCH (mm)-[:RELATES_TO]-(o:Memory)
         WITH mm, count(DISTINCT o) AS deg
         RETURN max(deg) AS maxDeg, avg(deg) AS avgDeg,
                percentileCont(deg, 0.95) AS p95,
                count(CASE WHEN deg >= 50 THEN 1 END) AS over50`,
        { userId },
      );
      const d = dist.records[0];
      console.log(
        `account RELATES_TO degree: max=${String(d.get("maxDeg"))} avg=${Number(d.get("avgDeg")).toFixed(1)} p95=${String(d.get("p95"))} nodes≥50=${String(d.get("over50"))}`,
      );
    }
  } finally {
    await session.close();
    await closeDriver();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
