import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import actionCache from "@convex-dev/action-cache/convex.config";
import crons from "@convex-dev/crons/convex.config";
import auditLog from "convex-audit-log/convex.config";

const app = defineApp();
app.use(agent);
app.use(actionRetrier);
app.use(actionCache);
app.use(crons);
app.use(auditLog);

export default app;
