import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "daily connector sync",
  "0 4 * * *",
  internal.connectors.syncWorkflow.kickoffDailyConnectorSync,
  {},
);

// folds append-only openRouter log rows into the cost/token aggregates
crons.interval(
  "drain openRouter log aggregates",
  { minutes: 1 },
  internal.openRouterLogs.drainAggregatesInternal,
  {},
);

// folds pending retrieve, context-pack and result-open hits into memoryUsage
// (typeahead searches never count); the memory row is rescored only on a real
// change, at most daily
crons.interval(
  "flush memory access",
  { minutes: 2 },
  internal.memoryUsefulness.flushAccessPending,
  {},
);

// scores a small batch of new or changed memories with TypeSafe Jev (skips
// low-prior sources, backs off failures, stops on a bad key)
crons.interval(
  "score memory usefulness",
  { minutes: 10 },
  internal.memoryUsefulness.kickJevQuality,
  {},
);

export default crons;
