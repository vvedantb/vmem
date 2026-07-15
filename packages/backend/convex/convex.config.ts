// MIGRATION: removing `@convex-dev/workflow` + `@convex-dev/action-retrier`.
// In-flight Workflow runs / ActionRetrier jobs will not resume after deploy.
// Prefer deploying when daily syncs are idle (outside 04:00 UTC cron window).
import { defineApp } from "convex/server";
import actionCache from "@convex-dev/action-cache/convex.config";
import crons from "@convex-dev/crons/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
import auditLog from "convex-audit-log/convex.config";

const app = defineApp();
app.use(actionCache);
app.use(crons);
app.use(workpool, { name: "connectorSyncPool" });
app.use(workpool, { name: "codebaseSyncPool" });
app.use(auditLog);

export default app;
