// migration: removing @convex-dev/workflow + @convex-dev/action-retrier
// in-flight workflow runs / action-retrier jobs will not resume after deploy
// prefer deploying when daily syncs are idle (outside 0400 utc cron window)
import { defineApp } from "convex/server";
import actionCache from "@convex-dev/action-cache/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";
import crons from "@convex-dev/crons/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
import auditLog from "convex-audit-log/convex.config";

const app = defineApp();
app.use(actionCache);
app.use(crons);
app.use(workpool, { name: "connectorSyncPool" });
app.use(workpool, { name: "codebaseSyncPool" });
app.use(auditLog);
// openRouter usage: cost/tokens by createdAt + distinct models (namespaced u,/t,)
app.use(aggregate, { name: "openRouterLogCost" });
app.use(aggregate, { name: "openRouterLogTokens" });
app.use(aggregate, { name: "openRouterModels" });

export default app;
