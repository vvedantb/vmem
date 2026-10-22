import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 02:30 utc, before the connector sync: per user, dream step then the day
// rollup for yesterday (NIGHTLY_DISABLED=1 stops it)
crons.cron("nightly maintenance", "30 2 * * *", internal.nightly.kick, {});

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

// drops mcp tool traces and their details older than 7 days, 500 rows a batch
crons.interval(
  "purge expired traces",
  { hours: 1 },
  internal.mcpTraces.purgeExpired,
  {},
);

// drops drained openRouter log rows older than OPENROUTER_LOG_RETENTION_DAYS,
// 500 rows a batch; a no-op while that env var is unset
crons.interval(
  "purge expired openRouter logs",
  { hours: 1 },
  internal.openRouterLogs.purgeExpired,
  {},
);

// drops dreamActions log rows 90 days after their 30-day undo window closed,
// 500 rows a batch; memories are never deleted
crons.interval(
  "purge expired dream actions",
  { hours: 1 },
  internal.dream.purgeExpiredActions,
  {},
);

// drops one-off cleanup plans (dreamPlanGroups) 30 days after their dry run
crons.interval(
  "purge old dream cleanup plans",
  { hours: 1 },
  internal.dreamCleanup.purgeOldPlanGroups,
  {},
);

export default crons;
