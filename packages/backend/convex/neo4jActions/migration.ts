"use node";

/**
 * Barrel for profile memory lifecycle actions.
 * Bodies live in `./migration/profiles`.
 */

export {
  moveMemoriesBetweenProfiles,
  deleteMemoriesByProfile,
} from "./migration/profiles";
