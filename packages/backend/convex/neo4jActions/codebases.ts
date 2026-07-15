"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { deleteCodebase } from "../../engine/neo4j/codebaseService";
import { runWithNeo4jDriver } from "./_shared/driver";

export const deleteCodebaseInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) => {
    await runWithNeo4jDriver(args, ({ driver, userId, codebaseId }) =>
      deleteCodebase(driver, userId, codebaseId),
    );
    return null;
  },
});
