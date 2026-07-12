import { fullMemories, fullRelationships, SEED_USER_IDS } from "./dataset";
import { runSeed } from "./engine";

runSeed({
  userIds: SEED_USER_IDS,
  templateMemories: fullMemories,
  templateRelationships: fullRelationships,
  embedAfterInsert: false,
}).catch((err: unknown) => {
  console.error("seed failed:", err);
  process.exit(1);
});
