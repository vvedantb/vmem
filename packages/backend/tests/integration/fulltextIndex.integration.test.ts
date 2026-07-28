// Live Neo4j suite for fulltext index drift, gated by RUN_RETRIEVAL_EVAL=1.
//
// setup.ts declares memory_content over [title, content], but `CREATE ... IF NOT
// EXISTS` keeps whatever index already exists. On 28 July 2026 the live database
// indexed content only, so a memory whose keywords lived in its title was
// unretrievable. This suite runs the repair and proves the title path works.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Driver } from "neo4j-driver";
import { z } from "zod";
import { closeDriver, getDriver } from "../../engine/neo4j/driver";
import {
  createMemory,
  deleteAllMemoriesForUser,
} from "../../engine/neo4j/memory/crud";
import { computeContentHash } from "../../engine/neo4j/memory/mappers";
import { retrieveMemories } from "../../engine/neo4j/memory/retrieve";
import { neo4jField, neo4jString } from "../../engine/neo4j/record";
import { ensureNeo4jSetupIfNeeded } from "../../engine/neo4j/setup";

const runLive = process.env.RUN_RETRIEVAL_EVAL === "1";
const USER = "user_vmem_fulltext_probe";
const PROFILE = "profile_vmem_fulltext_probe";
// tokens that appear in the title and nowhere in the body
const TITLE = "Zarquon flibbertigibbet retrieval heading";
const CONTENT = "Body text that deliberately shares no words with the heading.";
const QUERY = "zarquon flibbertigibbet";

const propertyListSchema = z.array(z.string());

// Repopulation after a drop is asynchronous and Aura is not fast about it.
async function waitForIndex(driver: Driver): Promise<string[]> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const result = await driver.executeQuery(
      `SHOW INDEXES YIELD name, state, properties
       WHERE name = 'memory_content'
       RETURN state, properties`,
    );
    const record = result.records[0];
    if (record !== undefined) {
      const state = neo4jString(record, "state");
      const properties = neo4jField(record, "properties", propertyListSchema);
      if (state === "ONLINE" && properties.includes("title")) return properties;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("memory_content never came back online with title indexed");
}

describe.skipIf(!runLive)("fulltext index drift (live Neo4j)", () => {
  let driver: Driver;

  beforeAll(() => {
    driver = getDriver();
  });
  afterAll(async () => {
    await deleteAllMemoriesForUser(driver, USER);
    await closeDriver();
  });

  it(
    "retrieves a memory whose keywords live only in its title",
    { timeout: 300_000 },
    async () => {
      await deleteAllMemoriesForUser(driver, USER);

      // idempotent: a no-op once memory_content already indexes title
      await ensureNeo4jSetupIfNeeded(driver);
      const properties = await waitForIndex(driver);
      expect(properties).toEqual(expect.arrayContaining(["title", "content"]));

      const created = await createMemory(driver, {
        userId: USER,
        profileId: PROFILE,
        graphScope: "personal",
        title: TITLE,
        content: CONTENT,
        type: "knowledge",
        source: "fulltext-index-test",
        tags: [],
        confidence: 0.9,
        embedding: null,
        contentHash: computeContentHash(TITLE, CONTENT),
      });

      let ids: string[] = [];
      for (let attempt = 0; attempt < 40; attempt++) {
        const candidates = await retrieveMemories(driver, {
          scope: { kind: "personal", userId: USER, profileId: PROFILE },
          query: QUERY,
          queryEmbedding: null,
          limit: 10,
          legs: { vector: false, chunk: false },
        });
        ids = candidates.map((candidate) => candidate.id);
        if (ids.includes(created.id)) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      expect(ids).toContain(created.id);
    },
  );

  it("leaves the repaired index alone on a second pass", async () => {
    // the repair reports a change only when properties actually differ
    expect(await ensureNeo4jSetupIfNeeded(driver)).toBe(false);
  });
});
