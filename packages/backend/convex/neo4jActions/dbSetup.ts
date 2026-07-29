"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import {
  ensureNeo4jSetupIfNeeded,
  setupDatabase,
} from "../../engine/neo4j/setup";
import { getDriver } from "../../engine/neo4j/driver";

// force full neo4j ddl (manual / after new indexes ship in setup.ts)
export const ensureNeo4jSetup = internalAction({
  args: {},
  returns: v.null(),
  handler: async (_ctx) => {
    await setupDatabase(getDriver());
    return null;
  },
});

// cheap check + setup only when indexes are missing (auto on first codebase sync)
export const ensureNeo4jSetupIfNeededInternal = internalAction({
  args: {},
  returns: v.object({ ranSetup: v.boolean() }),
  handler: async (_ctx) => {
    const ranSetup = await ensureNeo4jSetupIfNeeded(getDriver());
    return { ranSetup };
  },
});
