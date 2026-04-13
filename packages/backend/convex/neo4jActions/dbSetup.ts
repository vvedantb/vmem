"use node";

import { internalAction } from "../_generated/server";
import { setupDatabase } from "../../src/neo4j/setup";
import { getDriver } from "../../src/neo4j/driver";

export const ensureNeo4jSetup = internalAction({
  args: {},
  handler: async (_ctx) => {
    await setupDatabase(getDriver());
    return null;
  },
});
