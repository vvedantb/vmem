/** One-time migration: merge duplicate Entity nodes by (userId, normalizedName). */
import { getDriver, closeDriver } from "../engine/neo4j/driver";
import { z } from "zod";

const duplicateEntityNodeSchema = z.object({
  id: z.coerce.string(),
  name: z.coerce.string(),
  mentions: z.coerce.number(),
  createdAt: z.coerce.string(),
});

const duplicateEntityNodesSchema = z.array(duplicateEntityNodeSchema);

async function main() {
  const driver = getDriver();
  const session = driver.session();
  try {
    const groups = await session.run(
      `MATCH (e:Entity)
       OPTIONAL MATCH (e)<-[:MENTIONS]-(m:Memory)
       WITH e, count(m) AS mentions
       WITH e.userId AS userId, e.normalizedName AS norm,
            collect({id: e.id, name: e.name, mentions: mentions, createdAt: toString(e.createdAt)}) AS nodes
       WHERE size(nodes) > 1
       RETURN userId, norm, nodes`,
    );
    console.log(`duplicate groups: ${String(groups.records.length)}`);

    let merged = 0;
    for (const rec of groups.records) {
      const norm = String(rec.get("norm"));
      const nodesParsed = duplicateEntityNodesSchema.safeParse(
        rec.get("nodes"),
      );
      if (!nodesParsed.success) continue;
      const nodes = nodesParsed.data.sort(
        (a, b) =>
          b.mentions - a.mentions || a.createdAt.localeCompare(b.createdAt),
      );
      const survivor = nodes[0];
      const dups = nodes.slice(1);
      if (!survivor || dups.length === 0) continue;
      // Best display name: highest-mentioned variant that isn't all-lowercase
      // (e.g. prefer "Eva" over "eva"); fall back to the survivor's.
      const displayName =
        nodes.find((n) => /[A-Z]/.test(n.name))?.name ?? survivor.name;

      await session.run(
        `MATCH (survivor:Entity {id: $survivorId})
         SET survivor.name = $displayName
         WITH survivor
         UNWIND $dupIds AS dupId
         MATCH (dup:Entity {id: dupId})
         OPTIONAL MATCH (dup)<-[r:MENTIONS]-(m:Memory)
         FOREACH (_ IN CASE WHEN m IS NULL THEN [] ELSE [1] END |
           MERGE (m)-[:MENTIONS]->(survivor)
         )
         DELETE r
         WITH DISTINCT dup
         DETACH DELETE dup`,
        { survivorId: survivor.id, dupIds: dups.map((d) => d.id), displayName },
      );
      merged += dups.length;
      console.log(
        `  merged "${norm}": kept ${survivor.id.slice(0, 8)} (${String(survivor.mentions)} mentions, name "${displayName}"), removed ${String(dups.length)}`,
      );
    }
    console.log(`total duplicate nodes removed: ${String(merged)}`);

    // Constraint swap — only valid now that (userId, normalizedName) is unique.
    await session.run(`DROP CONSTRAINT entity_user_name_type IF EXISTS`);
    await session.run(
      `CREATE CONSTRAINT entity_user_name IF NOT EXISTS
       FOR (e:Entity) REQUIRE (e.userId, e.normalizedName) IS UNIQUE`,
    );
    console.log(
      "constraint swapped: entity_user_name_type -> entity_user_name",
    );

    const remaining = await session.run(
      `MATCH (e:Entity)
       WITH e.userId AS u, e.normalizedName AS norm, count(e) AS n
       WHERE n > 1 RETURN count(*) AS groups`,
    );
    console.log(
      `remaining duplicate groups: ${String(remaining.records[0]?.get("groups"))}`,
    );
  } finally {
    await session.close();
    await closeDriver();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
