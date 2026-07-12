import { applyEvalCorpusProfile } from "./corpusProfile";
import {
  HANDCRAFTED_MEMORY_COUNT,
  handcraftedMemories,
  handcraftedRelationships,
  SEED_USER_IDS,
} from "../seed/dataset";
import { runSeed } from "../seed/engine";

const evalUserId = SEED_USER_IDS[0];
if (!evalUserId) {
  throw new Error("eval seed requires at least one seed user id");
}

const templateMemories = handcraftedMemories.map(applyEvalCorpusProfile);

runSeed({
  userIds: [evalUserId],
  templateMemories,
  templateRelationships: handcraftedRelationships,
  embedAfterInsert: true,
  logLabel: `eval seed: ${String(HANDCRAFTED_MEMORY_COUNT)} handcrafted memories for ${evalUserId}`,
}).catch((err: unknown) => {
  console.error("eval seed failed:", err);
  process.exit(1);
});
