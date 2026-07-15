// read-only tag distribution diagnostics
import { getDriver, closeDriver } from "../engine/neo4j/driver";
import { neo4jField, stringSchema } from "../engine/neo4j/record";

async function main() {
  const driver = getDriver();
  try {
    const users = await driver.executeQuery(
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
    const heaviest = neo4jField(firstUser, "userId", stringSchema);

    const hist = await driver.executeQuery(
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
    if (h === undefined) return;
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

    const top = await driver.executeQuery(
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

    const singles = await driver.executeQuery(
      `MATCH (t:Tag)<-[:TAGGED_WITH]-(m:Memory {userId: $userId})
       WITH t.name AS tag, count(m) AS uses
       WHERE uses = 1
       RETURN tag ORDER BY rand() LIMIT 30`,
      { userId: heaviest },
    );
    console.log("\n== sample single-use tags ==");
    console.log(singles.records.map((r) => String(r.get("tag"))).join(", "));
  } finally {
    await closeDriver();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
