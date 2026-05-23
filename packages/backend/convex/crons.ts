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

export default crons;
