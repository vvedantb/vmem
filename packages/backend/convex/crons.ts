import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "daily connector sync",
  "0 4 * * *",
  internal.connectors.syncWorkflow.kickoffDailyConnectorSync,
  {},
);

// 05:00 UTC daily — drop ended / long-idle live slide-share sessions and
// their presence rows so the presentation tables stay small.
crons.cron(
  "prune presentation sessions",
  "0 5 * * *",
  internal.presentations.pruneStaleInternal,
  {},
);

// folds append-only openRouter log rows into the cost/token aggregates
crons.interval(
  "drain openRouter log aggregates",
  { minutes: 1 },
  internal.openRouterLogs.drainAggregatesInternal,
  {},
);

export default crons;
