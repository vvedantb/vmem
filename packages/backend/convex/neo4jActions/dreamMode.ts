"use node";

/**
 * Barrel for Dream Mode internal actions.
 * Core per-profile pipeline lives in `./dreamMode/runProfile.ts`;
 * cron/manual entry points in `./dreamMode/entryPoints.ts`.
 */

export { runDreamForProfileInternal } from "./dreamMode/runProfile";

export {
  maybeRunDreamInternal,
  runDreamForProfileById,
  runDreamForActiveProfile,
  runDreamForUserInternal,
  runDreamForUserById,
  runDreamForActiveUser,
} from "./dreamMode/entryPoints";
