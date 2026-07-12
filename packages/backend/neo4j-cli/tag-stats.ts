/**
 * Read-only tag distribution diagnostics: per-user tag counts, usage
 * histogram, top tags, and a sample of single-use tags. Aggregates only —
 * never reads memory content. Run with `pnpm db:tag-stats`.
 *
 * Healthy ratio: most tag USES should hit multi-use tags. A spike in the
 * "once" bucket means tagging is minting one-off labels instead of reusing
 * themes (2026-06 audit: 3,623 of 4,962 tags were single-use — fixed by
 * vocabulary-aware enrichment + normalizeTags chokepoint).
 */
import { z } from "zod";
import { getDriver, closeDriver } from "../engine/neo4j/driver";
import { neo4jField } from "../engine/neo4j/record";

async function main() {
  const driver = getDriver();
  const session = driver.session();
  try {
    // Per-user memory + distinct tag counts (find the heavy account)
    const users = await session.run(
      `MATCH (m:Memory)
       WITH m.userId AS userId, count(m) AS memories
       OPTIONAL MATCH (t:Tag)<-[:TAGGED_WITH]-(m2:Memory {userId: userId})
       WITH userId, memories, count(DISTINCT t) AS tags
       RETURN userId, memories, tags
       ORDER BY memories DESC LIMIT 5`,
    );
    console.log("== users by memory count ==");
    for (const r of users.records) {
      console.log(
        `${String(r.get("userId"))}  memories=${String(r.get("memories"))}  distinctTags=${String(r.get("tags"))}`,
      );
    }

    const firstUser = users.records[0];
    if (!firstUser) return;
    const heaviest = neo4jField(firstUser, "userId", z.string());

    // Usage histogram: how many tags are used 1x, 2x, 3-5x, 6-20x, >20x
    const hist = await session.run(
      `MATCH (t:Tag)<-[:TAGGED_WITH]-(m:Memory {userId: $userId})
       WITH t, count(m) AS uses
       RETURN
         count(CASE WHEN uses = 1 THEN 1 END) AS once,
         count(CASE WHEN uses = 2 THEN 1 END) AS twice,
         count(CASE WHEN uses >= 3 AND uses <= 5 THEN 1 END) AS three_five,
         count(CASE WHEN uses >= 6 AND uses <= 20 THEN 1 END) AS six_twenty,
         count(CASE WHEN uses > 20 THEN 1 END) AS over_twenty,
         count(t) AS total`,
      { userId: heaviest },
    );
    const h = hist.records[0];
    console.log(`\n== tag usage histogram (${heaviest}) ==`);
    for (const k of [
      "once",
      "twice",
      "three_five",
      "six_twenty",
      "over_twenty",
      "total",
    ]) {
      console.log(`${k}: ${String(h.get(k))}`);
    }

    // Top 25 tags by usage (names are user-derived; local debugging only)
    const top = await session.run(
      `MATCH (t:Tag)<-[:TAGGED_WITH]-(m:Memory {userId: $userId})
       WITH t.name AS tag, count(m) AS uses
       RETURN tag, uses ORDER BY uses DESC LIMIT 25`,
      { userId: heaviest },
    );
    console.log("\n== top tags ==");
    for (const r of top.records) {
      console.log(
        `${String(r.get("uses")).padStart(5)}  ${String(r.get("tag"))}`,
      );
    }

    // Sample of single-use tags to see their shape
    const singles = await session.run(
      `MATCH (t:Tag)<-[:TAGGED_WITH]-(m:Memory {userId: $userId})
       WITH t.name AS tag, count(m) AS uses
       WHERE uses = 1
       RETURN tag ORDER BY rand() LIMIT 30`,
      { userId: heaviest },
    );
    console.log("\n== sample single-use tags ==");
    console.log(singles.records.map((r) => String(r.get("tag"))).join(", "));
  } finally {
    await session.close();
    await closeDriver();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
