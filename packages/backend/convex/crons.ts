import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 04:00 UTC daily — stale codebases sync via durable workflow (one action per repo).
crons.cron(
  "daily codebase sync",
  "0 4 * * *",
  internal.codebaseSync.kickoffDailyCodebaseSync,
  {},
);

// 04:00 UTC daily — full connector ingest for every connected provider.
crons.cron(
  "daily connector sync",
  "0 4 * * *",
  internal.connectors.syncWorkflow.kickoffDailyConnectorSync,
  {},
);

export default crons;
