import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Dream Mode V2 — daily background reasoning pass.
 *
 * Fans out per-profile runs of the Dreamer pipeline (surprisal scoring,
 * cluster synthesis, proposal/materialization). Self-rescheduling cursor
 * inside `runDreamForAllUsersInternal` keeps each tick bounded, so this
 * cron just kicks off the first batch.
 *
 * Time chosen so it lands during low-traffic hours for our typical user
 * timezones (US/EU). Frequency is 24h; a single user can also force a
 * fresh pass via the manual button on `/proposals` (rate-limited to 1/hr).
 */
crons.interval(
  "dream-mode-daily",
  { hours: 24 },
  internal.neo4jActions.dreamMode.runDreamForAllUsersInternal,
  {},
);

export default crons;
