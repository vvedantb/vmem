import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 0400 utc daily, stale codebases sync via workpool (one action per repo)
crons.cron(
  "daily codebase sync",
  "0 4 * * *",
  internal.codebaseSync.kickoffDailyCodebaseSync,
  {},
);

// 0400 utc daily, full connector ingest for every connected provider
crons.cron(
  "daily connector sync",
  "0 4 * * *",
  internal.connectors.syncWorkflow.kickoffDailyConnectorSync,
  {},
);

// every 30 min, flip codebases stuck in syncing past the stale window to error so a dead sync action stops spinning forever in the ui
crons.interval(
  "recover stale codebase syncs",
  { minutes: 30 },
  internal.codebases.recoverStaleSyncingInternal,
  {},
);

export default crons;
